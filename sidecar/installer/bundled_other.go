//go:build !(windows && amd64)

package main

// On non-windows/amd64 builds (macOS, Linux, windows/arm64) no payload is
// embedded. bundledPayload returns nil, false and the installer falls through
// to the npm registry path.
