//go:build !pipodebug

package main

import (
	"testing"

	"github.com/pipo/sidecar/internal/update"
)

// Release builds must not let the environment redirect the updater.
func TestUpdateRegistryIgnoresEnvInReleaseBuilds(t *testing.T) {
	t.Setenv("pipo_UPDATE_REGISTRY", "http://127.0.0.1:1")
	if got := updateRegistryURL(); got != update.DefaultRegistryURL {
		t.Errorf("updateRegistryURL() = %q, want %q", got, update.DefaultRegistryURL)
	}
}
