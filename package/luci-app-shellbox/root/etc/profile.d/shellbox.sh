#!/bin/sh
# shellbox 终端会话的 cwd 汇报钩子（只在 shellbox 自己的会话里生效）
#
# /etc/init.d/shellbox 给 ttyd 传了 SHELLBOX=1，ttyd 把它传给 /bin/login → shell，
# 所以 SSH / 串口 / 别的终端都不受影响。
#
# 协议用 iTerm2 的 OSC 1337 cwd 约定：ESC ] 1337 ; cwd=<path> BEL
# 前端（shellbox/term.js）用 xterm 的 registerOscHandler(1337) 解析；
# 只有「目录联动」开关打开时，右侧文件面板才会跟着终端目录走。

shellbox_is_ttyd_session() {
	# /bin/login 会清掉 ttyd 传下来的 SHELLBOX 环境变量，
	# 所以再检查一层进程树：shell -> login -> ttyd。
	[ "$SHELLBOX" = "1" ] && return 0

	[ -r "/proc/$PPID/stat" ] || return 1
	grandparent=$(cut -d' ' -f4 "/proc/$PPID/stat" 2>/dev/null)
	[ -n "$grandparent" ] || return 1
	[ "$(cat "/proc/$grandparent/comm" 2>/dev/null)" = "ttyd" ]
}

shellbox_is_ttyd_session || { return 0 2>/dev/null || exit 0; }

shellbox_report_cwd() {
	printf '\033]1337;cwd=%s\007' "$PWD"
}

# 只在目录真的换了之后才汇报；cd 失败不动
cd() {
	command cd "$@" && shellbox_report_cwd
}

# 登录 shell 就绪后才允许前端把文件面板目录同步到终端。
printf '\033]1337;shellbox-ready\007'
