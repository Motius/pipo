//go:build windows && amd64

package main

import _ "embed"

// payload-win32-x64.tgz is a placeholder in the repo (a few bytes). The
// installer-release workflow replaces it with the real signed sidecar
// tarball before `go build`, so the embedded bytes are the real payload in
// release builds. The size guard in bundledPayload (minBundledTarballBytes)
// treats the placeholder as "no payload" so local dev builds fall through to
// the npm path.
//
//go:embed payload-win32-x64.tgz
var bundledTarball []byte

// Stamped at release time via -ldflags:
//
//	-X main.bundledVersion=0.10.0
//	-X main.bundledSHA512=<base64>
//
// Empty in local builds → bundledPayload returns false → npm path.
var bundledVersion = ""
var bundledSHA512 = ""

// minBundledTarballBytes is the floor below which the embedded file is
// treated as a placeholder. The real sidecar tarball is several MB; the
// placeholder committed to the repo is under 100 bytes.
const minBundledTarballBytes = 4096

func bundledPayload() (*bundledInfo, bool) {
	if bundledVersion == "" || bundledSHA512 == "" {
		return nil, false
	}
	if len(bundledTarball) < minBundledTarballBytes {
		return nil, false
	}
	return &bundledInfo{
		Version: bundledVersion,
		Tarball: bundledTarball,
		SHA512:  bundledSHA512,
	}, true
}
