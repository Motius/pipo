package main

// The install/update flow shared by console/silent mode and the GUI wizard.
// Every failure maps to one of the frozen exit codes in main.go.

import (
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/pipo/sidecar/internal/update"
)

// minSetupSidecarVersion is the first sidecar release whose flag.Parse knows
// --setup. Older sidecars hard-exit on unknown flags with a dead stderr under
// -H windowsgui, so the handoff is version-gated.
const minSetupSidecarVersion = "0.9.1"

func logf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
}

// installedSidecar is what detection found on this machine.
type installedSidecar struct {
	Version    string // "" when absent
	InstallDir string // "" when absent
	// PackageManager is "bun" or "npm" when a global install of the package
	// owns the sidecar here, "" otherwise. Which one matters: they keep
	// separate global trees, so only the owner's commands reach it.
	PackageManager string
}

// progressFn receives coarse stage updates ("download", "verify", "install")
// with a human-readable detail line. Never called concurrently.
type progressFn func(stage, detail string)

// installOutcome is performInstall's result: Code is a main.go exit code,
// Err the terminal failure (nil on success), and the flags say which of the
// no-op success paths was taken.
type installOutcome struct {
	Code       int
	Err        error
	Rel        *pkgRelease
	Inst       installedSidecar
	InstallDir string
	UpToDate   bool
	NpmManaged bool
}

// performInstall runs resolve → detect → download → verify → stop → swap →
// register. It never launches the sidecar — callers own that (console mode
// respects --no-launch; the wizard launches from its Done page).
//
// When a bundled sidecar payload is embedded (Windows release builds), the
// resolve/download/verify-signature steps are short-circuited: the embedded
// tarball is written locally, sha512-verified against the build-time pin, and
// unpacked. The installer's own Authenticode signature already anchors
// provenance, so per-payload signature verification is skipped on this path.
func performInstall(registryURL string, silent bool, progress progressFn) installOutcome {
	fail := func(code int, err error) installOutcome {
		return installOutcome{Code: code, Err: err}
	}

	// ── Bundled payload fast lane ──────────────────────────────
	// When the installer embeds a signed sidecar tarball (Windows release
	// builds), skip the npm registry entirely. This sidesteps the npm
	// `@pipo` scope Trusted Publishing requirement that would otherwise
	// 404 and dead-end the install.
	if bundled, ok := bundledPayload(); ok {
		return performBundledInstall(bundled, silent, progress, fail)
	}

	progress("resolve", "Checking the latest sidecar version…")
	rel, err := fetchLatestRelease(registryURL)
	if err != nil {
		return fail(exitNetwork, fmt.Errorf("could not resolve the latest sidecar: %w", err))
	}

	inst, err := detectInstalled()
	if err != nil {
		return fail(exitOther, fmt.Errorf("could not inspect the existing installation: %w", err))
	}
	out := installOutcome{Code: exitOK, Rel: rel, Inst: inst}
	switch {
	case inst.PackageManager != "":
		out.NpmManaged = true
		return out
	case inst.Version != "" && !versionLess(inst.Version, rel.Version):
		out.UpToDate = true
		out.InstallDir = inst.InstallDir
		return out
	}

	workDir, err := os.MkdirTemp("", "pipo-installer-*")
	if err != nil {
		return fail(exitFilesystem, fmt.Errorf("could not create a work directory: %w", err))
	}
	defer os.RemoveAll(workDir)

	// No version in the detail line: it is what the wizard's stage row shows,
	// and that row is not the place for a number the user did not pick. The
	// console path still names the resolved version on its final line.
	progress("download", "Downloading the latest sidecar…")
	tgz, err := update.Download(rel, workDir)
	if err != nil {
		return fail(exitNetwork, err)
	}

	progress("verify", "Verifying the payload (sha512 + code signature)…")
	staged := filepath.Join(workDir, "staged")
	if err := update.Extract(tgz, staged); err != nil {
		// Guard violations mean the payload is untrustworthy (3); local I/O
		// failures (disk full, permissions) are filesystem errors (5). The
		// exit codes are a frozen contract, so don't conflate them.
		var rej update.PayloadRejectedError
		if errors.As(err, &rej) {
			return fail(exitVerification, fmt.Errorf("payload rejected: %w", err))
		}
		return fail(exitFilesystem, fmt.Errorf("could not unpack the payload: %w", err))
	}
	stagedBin := filepath.Join(staged, "bin")
	// Layout before signature: a package that predates the current layout would
	// otherwise surface as "code-signature verification failed", sending the
	// reader after a signing problem that does not exist.
	if err := update.CheckPayloadLayout(stagedBin, rel.Version); err != nil {
		return fail(exitVerification, err)
	}
	if err := update.VerifyPayloadSignature(stagedBin); err != nil {
		return fail(exitVerification, fmt.Errorf("code-signature verification failed (refusing to install an unverified sidecar): %w", err))
	}

	progress("install", "Stopping the running sidecar…")
	if err := stopRunningSidecar(inst, silent); err != nil {
		return fail(exitStopFailed, fmt.Errorf("could not stop the running sidecar: %w", err))
	}

	installDir := inst.InstallDir
	if installDir == "" {
		if installDir, err = installDirDefault(); err != nil {
			return fail(exitFilesystem, fmt.Errorf("no writable install location: %w", err))
		}
	}
	progress("install", fmt.Sprintf("Installing to %s…", installDir))
	if err := update.Swap(stagedBin, installDir); err != nil {
		return fail(exitFilesystem, fmt.Errorf("install failed: %w", err))
	}
	// The running sidecar was stopped above, so nothing needs the previous
	// copy for a rollback.
	if err := update.CleanupOld(installDir); err != nil {
		logf("warning: could not remove the previous copy: %v", err)
	}
	out.InstallDir = installDir

	if got, err := update.InstalledBinaryVersion(installDir); err != nil {
		logf("warning: post-install version check failed: %v", err)
	} else if got != rel.Version {
		logf("warning: installed binary reports %q, expected %q", got, rel.Version)
	}

	// System registration (uninstall entry, Start Menu, uninstaller copy) —
	// real on Windows, no-op elsewhere.
	if err := registerInstall(installDir, rel.Version); err != nil {
		logf("warning: system registration incomplete: %v", err)
	}
	return out
}

// runInstall is the console/silent entrypoint.
func runInstall(registryURL string, silent, noLaunch, autostartOn bool) int {
	out := performInstall(registryURL, silent, func(_, detail string) { logf("%s", detail) })
	switch {
	case out.Err != nil:
		logf("%v", out.Err)
		if out.Code == exitNetwork {
			logf("(the npm registry is the only payload source — check the network and retry)")
		}
		return out.Code
	case out.NpmManaged:
		pm := out.Inst.PackageManager
		logf("this machine's sidecar is managed by %s; update it with: %s update -g @pipo/sidecar", pm, pm)
		return exitOK
	case out.UpToDate:
		logf("installed sidecar %s is already current", out.Inst.Version)
		return exitOK
	}
	logf("installed sidecar %s to %s", out.Rel.Version, out.InstallDir)
	if shouldApplyAutostart(out) {
		if err := applyAutostart(out.InstallDir, autostartOn); err != nil {
			logf("warning: autostart registration failed: %v", err)
		}
	}
	if !noLaunch {
		firstInstall := out.Inst.Version == ""
		if err := launchInstalled(out.InstallDir, out.Rel.Version, firstInstall); err != nil {
			logf("warning: could not launch the sidecar: %v", err)
		}
	}
	return exitOK
}

// shouldApplyAutostart reports whether this run may touch the login-item
// registration. FIRST INSTALL ONLY: the sidecar never clears its Run value
// when the preference is off, so re-applying on an update would silently
// resurrect a login item the user had disabled. No-op outcomes (npm-managed,
// already current) installed nothing and must not touch it either.
func shouldApplyAutostart(out installOutcome) bool {
	return !out.NpmManaged && !out.UpToDate && out.Inst.Version == ""
}

// performBundledInstall installs from an embedded sidecar payload, bypassing
// the npm registry. Mirrors performInstall's shape but skips the network
// fetch (the tarball is already in memory) and the per-payload signature
// verification (the installer binary's own signature anchors provenance; the
// sha512 pin baked in at build time proves the tarball was not swapped).
func performBundledInstall(b *bundledInfo, silent bool, progress progressFn, fail func(int, error) installOutcome) installOutcome {
	progress("resolve", "Preparing the bundled sidecar…")
	rel := &pkgRelease{
		Name:    "@pipo/sidecar (bundled)",
		Version: b.Version,
		SHA512:  b.SHA512,
	}

	inst, err := detectInstalled()
	if err != nil {
		return fail(exitOther, fmt.Errorf("could not inspect the existing installation: %w", err))
	}
	out := installOutcome{Code: exitOK, Rel: rel, Inst: inst}
	switch {
	case inst.PackageManager != "":
		out.NpmManaged = true
		return out
	case inst.Version != "" && !versionLess(inst.Version, rel.Version):
		out.UpToDate = true
		out.InstallDir = inst.InstallDir
		return out
	}

	workDir, err := os.MkdirTemp("", "pipo-installer-*")
	if err != nil {
		return fail(exitFilesystem, fmt.Errorf("could not create a work directory: %w", err))
	}
	defer os.RemoveAll(workDir)

	// Write the embedded tarball to disk so update.Extract (which reads a
	// file path) can unpack it. update.Download would normally stream from
	// the registry and hash while writing; here we hash the in-memory copy
	// against the build-time pin instead.
	progress("verify", "Verifying the bundled payload…")
	tgzPath, err := writeBundledTarball(b, workDir)
	if err != nil {
		return fail(exitVerification, err)
	}

	staged := filepath.Join(workDir, "staged")
	if err := update.Extract(tgzPath, staged); err != nil {
		var rej update.PayloadRejectedError
		if errors.As(err, &rej) {
			return fail(exitVerification, fmt.Errorf("payload rejected: %w", err))
		}
		return fail(exitFilesystem, fmt.Errorf("could not unpack the payload: %w", err))
	}
	stagedBin := filepath.Join(staged, "bin")
	if err := update.CheckPayloadLayout(stagedBin, rel.Version); err != nil {
		return fail(exitVerification, err)
	}
	// VerifyPayloadSignature is intentionally skipped for the bundled path:
	// the tarball is embedded in the installer binary, whose own
	// Authenticode signature (verified by Windows before the installer
	// runs) already proves the payload was not tampered with after the
	// installer was built. The sha512 check in writeBundledTarball proves
	// it was not corrupted in transit from the build to the embed step.

	progress("install", "Stopping the running sidecar…")
	if err := stopRunningSidecar(inst, silent); err != nil {
		return fail(exitStopFailed, fmt.Errorf("could not stop the running sidecar: %w", err))
	}

	installDir := inst.InstallDir
	if installDir == "" {
		if installDir, err = installDirDefault(); err != nil {
			return fail(exitFilesystem, fmt.Errorf("no writable install location: %w", err))
		}
	}
	progress("install", fmt.Sprintf("Installing to %s…", installDir))
	if err := update.Swap(stagedBin, installDir); err != nil {
		return fail(exitFilesystem, fmt.Errorf("install failed: %w", err))
	}
	if err := update.CleanupOld(installDir); err != nil {
		logf("warning: could not remove the previous copy: %v", err)
	}
	out.InstallDir = installDir

	if got, err := update.InstalledBinaryVersion(installDir); err != nil {
		logf("warning: post-install version check failed: %v", err)
	} else if got != rel.Version {
		logf("warning: installed binary reports %q, expected %q", got, rel.Version)
	}

	if err := registerInstall(installDir, rel.Version); err != nil {
		logf("warning: system registration incomplete: %v", err)
	}
	return out
}

// writeBundledTarball writes the embedded tarball to workDir/payload.tgz and
// verifies its sha512 against the build-time pin. The pin is the security
// anchor for the bundled path: it proves the bytes embedded at build time are
// the same bytes being installed, so a corrupt or swapped embed is caught
// before unpack.
func writeBundledTarball(b *bundledInfo, workDir string) (string, error) {
	want, err := base64.StdEncoding.DecodeString(b.SHA512)
	if err != nil {
		return "", fmt.Errorf("bundled integrity value is not valid base64: %w", err)
	}
	h := sha512.New()
	if _, err := h.Write(b.Tarball); err != nil {
		return "", fmt.Errorf("could not hash the bundled payload: %w", err)
	}
	got := h.Sum(nil)
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return "", fmt.Errorf("sha512 mismatch for the bundled payload — refusing to install")
	}
	dst := filepath.Join(workDir, "payload.tgz")
	f, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0600)
	if err != nil {
		return "", err
	}
	if _, err := f.Write(b.Tarball); err != nil {
		f.Close()
		return "", fmt.Errorf("could not stage the bundled payload: %w", err)
	}
	if err := f.Close(); err != nil {
		return "", err
	}
	return dst, nil
}

// setupHandoffAllowed gates passing --setup to the installed sidecar: older
// releases die on unknown flags.
func setupHandoffAllowed(version string) bool {
	return !versionLess(version, minSetupSidecarVersion)
}
