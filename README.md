# ImmortalWrt for VSOL V2902A-S (AN7583)

> 本仓库是 [naoki66/ImmortalWrt-for-Gemtek-brightspeed](https://github.com/naoki66/ImmortalWrt-for-Gemtek-brightspeed) 的派生版本，主要增加 **VSOL V2902A-S（Airoha AN7583，UBI 布局）** 的设备支持、PON/PPE 适配和 LuCI 界面。
>
> 上游仓库中其他 Gemtek / Nokia 设备的配置仍保留在源码树中，但没有在本 fork 的硬件上逐项验证；本 README 只描述本项目实际维护和验证的范围。

[![Kernel](https://img.shields.io/badge/kernel-6.18.60-red)](https://www.kernel.org/)
[![SoC](https://img.shields.io/badge/SoC-Airoha%20AN7583-orange)]()
[![Target](https://img.shields.io/badge/target-airoha%2Fan7583-blue)]()
[![License](https://img.shields.io/badge/license-GPL--2.0-green)](https://spdx.org/licenses/GPL-2.0-only.html)

## 当前状态

| 项目 | 内容 |
|---|---|
| 设备 | VSOL V2902A-S |
| SoC | Airoha AN7583（ARM Cortex-A53） |
| 内存 | 512 MiB |
| 存储 | SPI-NAND，UBI 布局 |
| 固件 | ImmortalWrt SNAPSHOT |
| 内核 | 6.18.60 |
| 引导 | U-Boot + BL31，UBI 中的 fit/fip 卷 |
| 管理地址 | `http://192.168.1.1` |
| 无线 | 无内置 Wi-Fi |

当前 Release 中的固件由本仓库的源码树加自定义 feed 构建，包含 TerminalPlus（ShellBox）1.1 和中文软件包管理界面。

Release 页面：[Kazusa1085/ImmortalWrt-AN758X-6.18 Releases](https://github.com/Kazusa1085/ImmortalWrt-AN758X-6.18/releases)

## 硬件与接口

| 项目 | VSOL V2902A-S |
|---|---|
| SoC | Airoha AN7583 |
| CPU | ARM Cortex-A53 |
| 内存 | 512 MiB |
| 存储 | SPI-NAND（当前 UBI 布局可用空间约 101 MiB） |
| LAN | 1 个 LAN 口 |
| SFP | 1 个 SFP 笼，对应 `eth1`，支持读取模块 EEPROM |
| PON | AN7583 + EN7572 光前端 |
| 按钮 | Reset |
| LED | power、PON、LOS、WAN、SFP、LAN |
| 无线 / USB | 无 |

设备树：[`target/linux/airoha/dts/an7583-vsol-v2902a-s.dts`](target/linux/airoha/dts/an7583-vsol-v2902a-s.dts)  
镜像定义：[`target/linux/airoha/image/an7583.mk`](target/linux/airoha/image/an7583.mk)  
设备 profile：`vsol_v2902a-s-ubi`

## 本项目完成的适配

### 1. 板级支持

- 新增 AN7583 VSOL V2902A-S 设备树，包含内存、SPI-NAND 分区、LED、Reset 键、SFP I2C 和 PON 引脚定义。
- 新增 UBI 镜像 profile 和 sysupgrade 镜像生成规则。
- 生成与设备匹配的 U-Boot FIP 与 preloader 产物。
- 增加设备专有的 LED 和网络初始化配置。

### 2. 内核与 PON / PPE

- 内核基线升级到 **6.18.60**。
- 保留并适配本项目使用的 Airoha PON、以太网、PPE 流卸载相关补丁。
- 适配 6.18.60 的转发路径 API 变化，并保留 bridge flowtable / PPE 相关功能。
- 使用 EN7572 PON 前端和 Airoha PON 驱动栈。

### 3. LuCI 界面

- **ONU 配置**：WAN 配置、PON 状态、硬件信息。
- **网络优化**：拆分为“设置”和“运行状态”两个页面；支持 Airoha PPE 硬件卸载、FullCone、TCP 拥塞控制与 SFP 端口速率设置。
- **TerminalPlus（ShellBox）1.1**：
  - “终端”和“设置”两个页面；
  - 浏览器终端（ttyd，默认 `/bin/login`，仅监听 LAN）；
  - 文件管理器；
  - 登录完成后的目录联动；
  - 断线自动重连；
  - 桌面与窄屏布局适配。
- 软件包管理器中文界面。

### 4. 系统集成

- 包含 `luci-app-package-manager` 及中文语言包。
- 包含 TerminalPlus 需要的 `ttyd`、`unzip`、`xz`、`bzip2` 等运行依赖。
- 默认不把终端暴露到 WAN：ttyd 监听 `br-lan`，终端本身仍需要登录认证。

## 构建

### 依赖

- GNU/Linux（推荐 Debian/Ubuntu）
- 至少 8 GB RAM、40 GB 可用磁盘（并行编译建议更高）
- OpenWrt/ImmortalWrt 构建依赖，见 [OpenWrt Build System](https://openwrt.org/docs/guide-developer/build-system/install-buildsystem)

### 步骤

```bash
git clone https://github.com/Kazusa1085/ImmortalWrt-AN758X-6.18.git
cd ImmortalWrt-AN758X-6.18

./scripts/feeds update -a
./scripts/feeds install -a

make menuconfig
# Target: Airoha -> AN7583 -> VSOL V2902A-S (UBI)
# 或使用与本设备匹配的 seed config 覆盖 .config

make -j$(nproc)
```

构建产物：

```text
bin/targets/airoha/an7583/
  immortalwrt-airoha-an7583-vsol_v2902a-s-ubi-squashfs-sysupgrade.itb
  immortalwrt-airoha-an7583-vsol_v2902a-s-ubi-bl31-uboot.fip
  immortalwrt-airoha-an7583-vsol_v2902a-s-ubi-preloader.bin
```

> [!NOTE]
> 本仓库不提交编译生成的 `build_dir`、`staging_dir`、`bin`、`dl`、日志、私钥或完整的可下载 feed。公开仓库只保留源码、设备配置和自定义 feed 源码。

## 刷写

### 常规升级

从已运行的 ImmortalWrt/OpenWrt 升级时，使用：

```text
firmware/immortalwrt-airoha-an7583-vsol_v2902a-s-ubi-squashfs-sysupgrade.itb
```

通过 LuCI 的“系统 → 备份/升级 → 刷写固件”选择该文件。

### Bootloader

Release 同时提供：

- `bootloader/immortalwrt-airoha-an7583-vsol_v2902a-s-ubi-bl31-uboot.fip`
- `bootloader/immortalwrt-airoha-an7583-vsol_v2902a-s-ubi-preloader.bin`

这些文件只用于首次部署或恢复，不是普通 sysupgrade 的一部分。刷写引导区有不可恢复风险，操作前必须确认设备型号、NAND 布局和启动日志，并保留原始分区备份。

> [!WARNING]
> 不要将本固件刷入其他 AN7581/AN7583 设备，也不要在不同 UBI/分区布局之间混刷。不同设备的 DTS、分区表和 `SUPPORTED_DEVICES` 不兼容。

## 与原 README 的勘误

- 原 README 主要描述上游 Gemtek XR1710G、XG2010G 和 Nokia XG-040G 系列；这些配置仍保留在源码树中，但不是本 fork 的维护重点，也未在本 fork 的硬件上验证。
- 删除原 README 中“root 无密码”和 Wi-Fi 默认 SSID/密码等描述：VSOL V2902A-S 没有内置 Wi-Fi，且默认凭据不应作为公开文档内容传播。
- 原 README 的 CI、Release 和构建链接指向上游仓库；本 README 改为指向本 fork。
- 原 README 的内核描述为 6.18 系列但未固定版本；当前验证基线为 6.18.60。
- 原 README 中针对 XR1710G 的 chainloader / trueKey 说明不适用于本设备，已从本 README 的主要流程中移除。

## 已知边界

- 目前只在 VSOL V2902A-S 上验证；仓库继承的其他设备配置未在本 fork 的硬件上验证。
- 设备没有内置 Wi-Fi，相关 Wi-Fi 配置不适用。
- SFP EEPROM 可以读取，但当前还没有独立的 SFP 信息页面。
- Feed 版本未固定到 commit；完全可复现构建需要自行锁定 `feeds.conf` 中的版本。

## 参考与致谢

- [immortalwrt/immortalwrt](https://github.com/immortalwrt/immortalwrt)
- [immortalwrt/luci](https://github.com/immortalwrt/luci)
- [immortalwrt/packages](https://github.com/immortalwrt/packages)
- [naoki66/ImmortalWrt-for-Gemtek-brightspeed](https://github.com/naoki66/ImmortalWrt-for-Gemtek-brightspeed)
- [naoki66/openwrt-pon-drivers](https://github.com/naoki66/openwrt-pon-drivers)
- [naoki66/OpenWrt_ONU_CONFIG](https://github.com/naoki66/OpenWrt_ONU_CONFIG)

## 许可证

[GPL-2.0-only](https://spdx.org/licenses/GPL-2.0-only.html)
