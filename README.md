# ImmortalWrt AN758X Linux 7.3.3

[![Kernel](https://img.shields.io/badge/kernel-7.3.3-red)](https://www.kernel.org/)
[![SoC](https://img.shields.io/badge/SoC-Airoha%20AN7581%20%2F%20AN7583-orange)]()
[![License](https://img.shields.io/badge/license-GPL--2.0-green)](https://spdx.org/licenses/GPL-2.0-only.html)

基于 [ImmortalWrt](https://github.com/immortalwrt/immortalwrt) 的 Linux 7.3.3 实验分支，面向 Airoha AN758X 平台的 ONU 设备。

当前支持：

- **Gemtek XG2010G**（AN7581，UBI）
- **VSOL V2902A-S**（AN7583，UBI）

当前分支：

| 分支 | 内容 |
|------|------|
| `main` | Linux 7.3.3，当前默认分支 |
| `an758x-6.18` | 原 Linux 6.18，保留旧设备与 XR1710G 文档 |

## 支持设备

| 设备 | SoC | 存储布局 | 网络 | 光接入 | 备注 |
|------|-----|----------|------|--------|------|
| Gemtek XG2010G | AN7581 | UBI | 2×10G RTL8261N、1×2.5G EN8811H、1G 交换口 | EN7572 xPON | 无 SFP；包含 FXS 语音驱动 |
| VSOL V2902A-S | AN7583 | UBI | 1G LAN、10G SFP+ | xPON | SFP+；AN7583 NPU |

管理地址默认通常为 `192.168.1.1`，用户名 `root`，初始无密码。

## 构建

```bash
git clone -b main https://github.com/Kazusa1085/ImmortalWrt-AN758X-7.3.git
cd ImmortalWrt-AN758X-7.3

./scripts/feeds update -a
./scripts/feeds install -a

make menuconfig
# Target: Airoha
# Subtarget: AN7581 (XG2010G) 或 AN7583 (VSOL V2902A-S)
# Target Profile: 对应设备

make -j$(nproc) world
```

产物位于：

```text
bin/targets/airoha/an7581/
bin/targets/airoha/an7583/
```

## 致谢

### 上游固件
- [immortalwrt/immortalwrt](https://github.com/immortalwrt/immortalwrt) - ImmortalWrt 主项目
- [immortalwrt/luci](https://github.com/immortalwrt/luci) - LuCI Web 界面
- [immortalwrt/packages](https://github.com/immortalwrt/packages) - 社区软件包仓库
- [openwrt/routing](https://github.com/openwrt/routing) - OpenWrt 路由相关包
- [openwrt/mt76](https://github.com/openwrt/mt76) - MediaTek WiFi 驱动

### 参考项目
- [YYH2913/openwrt](https://github.com/YYH2913/openwrt) - XR1710G 6.18 内核集成参考（an7581-xr1710g.dts 基础结构）
- [hurrian/openwrt-w1700k](https://github.com/hurrian/openwrt-w1700k) - XR1710G PCIe 3.0 x2 补丁参考（912 Gen3 速度协商）
- [lvcdy/openwrt_xr1710g](https://github.com/lvcdy/openwrt_xr1710g) - XR1710G 早期移植参考（分区表、PHY 配置）

### XG2010G PON 驱动与用户态
- [pbs05/openwrt-pon-drivers](https://github.com/pbs05/openwrt-pon-drivers) - XG2010G PON 内核驱动及新栈数据面来源。
- [naoki66/openwrt-pon-userspace](https://github.com/naoki66/openwrt-pon-userspace) - `airoha-ponctl`、`airoha-pond` 和整合 IPTV/语音页面的 LuCI ONU 用户态来源。

### LuCI 应用来源
- [naoki66/luci-app-airoha](https://github.com/naoki66/luci-app-airoha) - Airoha LuCI 应用 feed，包含 `luci-app-airoha-npu`
- [Gilly1970/Gemtek-W1700K](https://github.com/Gilly1970/Gemtek-W1700K) - Airoha 风扇控制与 FlowSense（commit db3f1c8）
- [sirpdboy/luci-app-lucky](https://github.com/sirpdboy/luci-app-lucky) - Lucky 多功能工具

### 相关工具
- [JetBrains](https://www.jetbrains.com/) - 开发工具支持
- [SourceForge](https://sourceforge.net/) - 镜像托管

## 许可证

[GPL-2.0-only](https://spdx.org/licenses/GPL-2.0-only.html)（继承 ImmortalWrt）。
