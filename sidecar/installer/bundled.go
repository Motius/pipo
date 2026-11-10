package main

// Bundled sidecar payload support.
//
// The installer normally resolves the latest sidecar from the npm registry
// (`@pipo/sidecar-<platform>`). When the npm `@pipo` scope is not yet set up
// for Trusted Publishing, that path 404s and the installer dead-ends before
// it can install anything.
//
// To make the Windows installer self-contained, the release workflow can
// embed a signed sidecar tarball directly in the installer binary via
// //go:embed. At runtime the installer checks whether a real bundled payload
// is present (the placeholder committed to the repo is too small to count);
// if so, it skips the npm fetch and installs from the embedded bytes.
//
// The embedded tarball is the same npm-style .tgz the registry would serve
// (package/bin/pipo.exe), so update.Extract unpacks it unchanged. The
// installer's own Authenticode signature (on pipo-Setup.exe itself) already
// anchors provenance, so VerifyPayloadSignature is skipped for the bundled
// path — the sha512 baked in at build time proves the tarball was not
// tampered with after the installer was built.
//
// Only win32-x64 is bundled today (the only platform the installer ships a
// Setup.exe for). macOS and Linux still go through npm; when `@pipo` is set
// up on npm those paths light up automatically, and the bundled Windows path
// becomes a harmless fast lane that skips a registry round-trip.

// bundledInfo describes an embedded sidecar payload.
type bundledInfo struct {
	// Version is the sidecar version baked in at build time (from
	// sidecar/VERSION). Empty means no payload was embedded.
	Version string
	// Tarball is the npm-style .tgz (package/bin/pipo.exe).
	Tarball []byte
	// SHA512 is the base64-encoded sha512 of Tarball, baked in at build
	// time. update.Download would normally get this from the registry's
	// dist.integrity; for the bundled path we stamp it via -ldflags.
	SHA512 string
}

// bundledPayload returns the embedded sidecar payload, or nil when no real
// payload was embedded (local dev builds, non-windows/amd64 builds). The
// per-platform files below override this stub.
func bundledPayload() (*bundledInfo, bool) { return nil, false }
