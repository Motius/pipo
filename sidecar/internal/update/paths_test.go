package update

import (
	"path/filepath"
	"testing"
)

// The install-directory walks are pure path logic, tested here on every OS
// (CI only runs the Go tests on Linux).
func TestBundleInstallDir(t *testing.T) {
	good := filepath.Join("/Applications", "pipo.app", "Contents", "MacOS", "pipo")
	if dir, err := bundleInstallDir(good); err != nil || dir != "/Applications" {
		t.Errorf("bundleInstallDir(%q) = %q, %v", good, dir, err)
	}
	for _, bad := range []string{
		filepath.Join("/Applications", "Other.app", "Contents", "MacOS", "pipo"),
		filepath.Join("/Applications", "pipo.app", "Contents", "Resources", "pipo"),
		filepath.Join("/Applications", "pipo.app", "Contents", "MacOS", "ocr-helper"),
		filepath.Join("/usr", "local", "bin", "pipo"),
	} {
		if dir, err := bundleInstallDir(bad); err == nil {
			t.Errorf("bundleInstallDir(%q) = %q, want an error", bad, dir)
		}
	}
}

func TestExeInstallDir(t *testing.T) {
	dir := filepath.Join("C:", "Users", "u", "AppData", "Local", "Programs", "pipo")
	if got, err := exeInstallDir(filepath.Join(dir, "pipo.EXE"), "pipo.exe", true); err != nil || got != dir {
		t.Errorf("case-folded name: %q, %v", got, err)
	}
	if _, err := exeInstallDir(filepath.Join(dir, "Pipo"), "pipo", false); err == nil {
		t.Error("case-sensitive layout accepted a different case")
	}
	if _, err := exeInstallDir(filepath.Join(dir, "sidecar-dev"), "pipo", false); err == nil {
		t.Error("unexpected executable name accepted")
	}
}

func TestValidVersion(t *testing.T) {
	for _, v := range []string{"0.10.0", "1.2.3-rc.1", "10.0.0-alpha-2"} {
		if !ValidVersion(v) {
			t.Errorf("ValidVersion(%q) = false", v)
		}
	}
	for _, v := range []string{"dev", "", "v0.10.0", " 0.10.0", "0.10.0+b1", "01.2.3", "1.2", "latest", "1.2.3-"} {
		if ValidVersion(v) {
			t.Errorf("ValidVersion(%q) = true", v)
		}
	}
}
