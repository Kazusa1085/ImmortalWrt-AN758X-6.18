# Per-device build configs

Each file is a complete `.config` for one supported device. The four files are built from the same source tree and include the per-device NPU/PHY/optical/voice firmware and the EIP93 crypto user-space packages.

| File | Target | Profile | Hardware validation |
|---|---|---|---|
| `xg2010g-ubi.config` | Airoha / AN7581 | `gemtek_xg2010g-ubi` | Tested on XG2010G |
| `xg040g-md-ubi.config` | Airoha / AN7581 | `nokia_xg-040g-md-ubi` | **Not hardware tested** |
| `xg040g-mf-ubi.config` | Airoha / AN7583 | `nokia_xg-040g-mf-ubi` | **Not hardware tested** |
| `vsol-v2902a-s-ubi.config` | Airoha / AN7583 | `vsol_v2902a-s-ubi` | Build-audited; hardware validation pending |

## Build

```bash
git clone https://github.com/Kazusa1085/ImmortalWrt-AN758X-6.18.git
cd ImmortalWrt-AN758X-6.18
./scripts/feeds update -a
./scripts/feeds install -a

cp configs/xg2010g-ubi.config .config
make defconfig
make -j$(nproc)
```

Select exactly one of the four config files. `make defconfig` is still recommended after copying; it normalizes dependencies without adding or removing the device package set.

Do not merge these files with another `.config`; use one full file as-is.
