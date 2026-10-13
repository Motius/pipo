//go:build !linux && !darwin

package main

// pipo:// URL-scheme registration, Windows: already registered every startup
// by windowsSetupNotifications (notify_windows.go writes
// HKCU\Software\Classes\pipo -> this exe for notification protocol
// activation; enroll links ride the same scheme and arrive via argv, handled
// by maybeForwardEnrollLaunch). Nothing extra to do.
func registerURLSchemeHandler() {}
