#!/bin/bash
# RPM %postun: $1 is 0 on a full uninstall and 1 or more on an upgrade.
# Replaces electron-builder's default script, which passes the wrong path to
# update-alternatives --remove (it fails and breaks `dnf remove`).

if [ "$1" = "0" ] || [ -z "$1" ]; then
    if type update-alternatives >/dev/null 2>&1; then
        update-alternatives --remove 'morse-trainer' '/opt/Morse Trainer/morse-trainer' >/dev/null 2>&1 || true
    fi
    if [ -L '/usr/bin/morse-trainer' ]; then
        rm -f '/usr/bin/morse-trainer'
    fi
    if [ -d '/opt/Morse Trainer' ]; then
        find '/opt/Morse Trainer' -depth -type d -empty -delete 2>/dev/null || true
    fi
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

exit 0
