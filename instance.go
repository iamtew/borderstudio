package main

import (
	"errors"
	"syscall"
	"unsafe"
)

const instanceMutex = `Local\BorderStudio`

var errAlreadyRunning = errors.New("already running")

var (
	modKernel32      = syscall.NewLazyDLL("kernel32.dll")
	procCreateMutexW = modKernel32.NewProc("CreateMutexW")
	modUser32        = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW  = modUser32.NewProc("MessageBoxW")
)

func lockInstance(name string) (syscall.Handle, error) {
	n, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0, err
	}
	r0, _, e := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(n)))
	h := syscall.Handle(r0)
	if h == 0 {
		if errno, ok := e.(syscall.Errno); ok && errno != 0 {
			return 0, errno
		}
		return 0, errors.New("CreateMutex failed")
	}
	if e == syscall.ERROR_ALREADY_EXISTS {
		syscall.CloseHandle(h)
		return 0, errAlreadyRunning
	}
	return h, nil
}

func alert(title, body string) {
	_, _ = messageBox(title, body, 0)
}

// confirm asks Yes/No. False on No and on any setup failure, so a bad string never deletes data.
func confirm(title, body string) bool {
	const mbYesNo = 0x4
	id, ok := messageBox(title, body, mbYesNo)
	return ok && id == 6 // IDYES
}

func messageBox(title, body string, flags uintptr) (uintptr, bool) {
	t, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return 0, false
	}
	b, err := syscall.UTF16PtrFromString(body)
	if err != nil {
		return 0, false
	}
	r, _, _ := procMessageBoxW.Call(0, uintptr(unsafe.Pointer(b)), uintptr(unsafe.Pointer(t)), flags)
	return r, true
}
