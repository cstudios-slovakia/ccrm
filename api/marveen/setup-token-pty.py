#!/usr/bin/env python3
# PTY relay for subscription CLI login (`claude setup-token`, `codex`, `gemini`)
# Adapted from Szotasz/marveen scripts/setup-token-pty.py (SETUPTOKENWIZ1022).
#
# Interactive subscription CLIs need a terminal: without a PTY they print nothing
# or refuse interactive OAuth. This stdlib-only relay provides a 512x24 PTY so
# OAuth URLs and tokens never hard-wrap.
#
# Modes:
#   1. Stream mode: setup-token-pty.py <binary> [subcommand...]
#   2. Session daemon mode: setup-token-pty.py --session <state_dir> <binary> [subcommand...]
#      Writes PTY output to <state_dir>/out.log, reads <state_dir>/in.fifo or <state_dir>/code.txt
#      and writes exit status to <state_dir>/exit.txt so stateless HTTP requests can drive it.
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios
import time

GRACE_S = 3.0
COLS, ROWS = 512, 24


def write_all(fd, data):
    while data:
        try:
            n = os.write(fd, data)
        except OSError as e:
            if e.errno == errno.EINTR:
                continue
            raise
        data = data[n:]


def run_session_daemon(state_dir, argv):
    os.makedirs(state_dir, exist_ok=True)
    out_path = os.path.join(state_dir, 'out.raw')
    code_path = os.path.join(state_dir, 'code.in')
    stop_path = os.path.join(state_dir, 'stop.flag')
    pid_path = os.path.join(state_dir, 'pty.pid')

    pid, master = pty.fork()
    if pid == 0:
        try:
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))
        except OSError:
            pass
        try:
            os.execv(argv[0], argv)
        except OSError:
            os._exit(127)

    with open(pid_path, 'w') as pf:
        pf.write(str(os.getpid()))

    out_fd = os.open(out_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    code_sent = False
    deadline = time.time() + 300.0  # 5 minute max session lifetime

    try:
        while time.time() < deadline:
            if os.path.exists(stop_path):
                break
            try:
                ready, _, _ = select.select([master], [], [], 0.25)
            except InterruptedError:
                continue
            if master in ready:
                try:
                    data = os.read(master, 65536)
                except OSError:
                    data = b''
                if not data:
                    break
                write_all(out_fd, data)
            if not code_sent and os.path.exists(code_path):
                try:
                    with open(code_path, 'rb') as cf:
                        code_bytes = cf.read().strip()
                    if code_bytes:
                        write_all(master, code_bytes + b'\r\n')
                        code_sent = True
                except OSError:
                    pass
    finally:
        try:
            os.close(out_fd)
        except OSError:
            pass
        try:
            os.close(master)
        except OSError:
            pass
        end_wait = time.time() + GRACE_S
        while time.time() < end_wait:
            done, _ = os.waitpid(pid, os.WNOHANG)
            if done:
                break
            time.sleep(0.05)
        else:
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
            try:
                os.waitpid(pid, 0)
            except OSError:
                pass
        try:
            os.unlink(pid_path)
        except OSError:
            pass
    return 0


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == '--session':
        state_dir = sys.argv[2]
        argv = sys.argv[3:]
        if not os.path.isabs(argv[0]):
            sys.stderr.write('usage: setup-token-pty.py --session <dir> <abs_binary> [args...]\n')
            return 2
        return run_session_daemon(state_dir, argv)

    if len(sys.argv) < 2 or not os.path.isabs(sys.argv[1]):
        sys.stderr.write('usage: setup-token-pty.py <absolute binary path> [args...]\n')
        return 2
    binary = sys.argv[1]
    argv = sys.argv[1:] if len(sys.argv) > 2 else [binary, 'setup-token']

    pid, master = pty.fork()
    if pid == 0:
        try:
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))
        except OSError:
            pass
        try:
            os.execv(binary, argv)
        except OSError:
            os._exit(127)

    stop = {'flag': False}

    def on_term(_signum, _frame):
        stop['flag'] = True

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGHUP, on_term)

    stdin_open = True
    while not stop['flag']:
        watch = [master] + ([0] if stdin_open else [])
        try:
            ready, _, _ = select.select(watch, [], [], 0.5)
        except InterruptedError:
            continue
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b''
            if not data:
                break
            write_all(1, data)
        if 0 in ready:
            data = os.read(0, 4096)
            if not data:
                break
            write_all(master, data)

    try:
        os.close(master)
    except OSError:
        pass

    deadline = time.time() + GRACE_S
    status = None
    while time.time() < deadline:
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            break
        time.sleep(0.05)
    else:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
        _, status = os.waitpid(pid, 0)

    if status is not None and os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    return 1


if __name__ == '__main__':
    sys.exit(main())
