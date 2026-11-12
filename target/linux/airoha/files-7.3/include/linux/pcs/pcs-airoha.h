/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef __LINUX_PCS_AIROHA_H
#define __LINUX_PCS_AIROHA_H

#include <linux/types.h>

struct phylink_pcs;

/**
 * enum airoha_pcs_pon_mode - Airoha PON line mode
 * @AIROHA_PCS_PON_MODE_GPON: 2.48832 Gbit/s downstream, 1.24416 Gbit/s upstream
 * @AIROHA_PCS_PON_MODE_XGPON: 9.95328 Gbit/s downstream, 2.48832 Gbit/s upstream
 * @AIROHA_PCS_PON_MODE_XGSPON: 9.95328 Gbit/s symmetric
 * @AIROHA_PCS_PON_MODE_EPON_1G: 1.25 Gbit/s symmetric
 * @AIROHA_PCS_PON_MODE_EPON_10G_1G: 10.3125 Gbit/s downstream, 1.25 Gbit/s upstream
 * @AIROHA_PCS_PON_MODE_EPON_10G_10G: 10.3125 Gbit/s symmetric
 */
enum airoha_pcs_pon_mode {
	AIROHA_PCS_PON_MODE_GPON,
	AIROHA_PCS_PON_MODE_XGPON,
	AIROHA_PCS_PON_MODE_XGSPON,
	AIROHA_PCS_PON_MODE_EPON_1G,
	AIROHA_PCS_PON_MODE_EPON_10G_1G,
	AIROHA_PCS_PON_MODE_EPON_10G_10G,
};

/**
 * struct airoha_pcs_pon_rx_status - Airoha PON PMA receive status
 * @signal_detected: PMA signal detect is stable across repeated samples
 * @rx_mode_raw: raw DIG_RESERVE_0 value; XG-PON uses 0x00000100
 * @freqdet_locked: PMA frequency feedback loop is locked
 * @frequency_level: raw frequency level from RX_FREQDET
 * @frequency_target: center of the FreqDet lock window; XG-PON uses 0xa49a
 * @rx_ready_gate: RX-ready gate is forced on
 * @rx_fifo_reset_released: RX FIFO reset_n is released
 */
struct airoha_pcs_pon_rx_status {
	bool signal_detected;
	u32 rx_mode_raw;
	bool freqdet_locked;
	u16 frequency_level;
	u16 frequency_target;
	bool rx_ready_gate;
	bool rx_fifo_reset_released;
	u32 calibration_stage;
	s32 calibration_error;
	u32 calibration_runs;
	u32 eo_fom;
	u8 eo_gain;
	u8 eo_peaking;
};

/**
 * airoha_pcs_pon_config_rx() - configure the Airoha PON PMA receive path
 * @pcs: Airoha PON PCS returned by fwnode_pcs_get()
 * @mode: PON line mode to receive
 * @xpon_setting0: complete PMA XPON_SETTING_0 value from the optical frontend
 * @xpon_setting1: complete PMA XPON_SETTING_1 value from the optical frontend
 */
int airoha_pcs_pon_config_rx(struct phylink_pcs *pcs,
			     enum airoha_pcs_pon_mode mode,
			     u32 xpon_setting0, u32 xpon_setting1);

/**
 * airoha_pcs_pon_retrain_rx() - retrain a configured Airoha PON PMA
 * @pcs: PON PCS configured by airoha_pcs_pon_config_rx()
 */
int airoha_pcs_pon_retrain_rx(struct phylink_pcs *pcs);

/**
 * airoha_pcs_pon_stop_rx() - stop the PON PMA through the PLUG_OUT sequence
 * @pcs: Airoha PON PCS provider
 *
 * Power down the TDC, return CDR to lock-to-reference, and retain the
 * first analog calibration result. Frontend and MAC providers own line state.
 */
int airoha_pcs_pon_stop_rx(struct phylink_pcs *pcs);

/**
 * airoha_pcs_pon_get_rx_status() - read Airoha PON PMA receive status
 * @pcs: Airoha PON PCS returned by fwnode_pcs_get()
 * @status: signal detect, FreqDet lock, and frequency level
 */
int airoha_pcs_pon_get_rx_status(struct phylink_pcs *pcs,
				 struct airoha_pcs_pon_rx_status *status);

#endif /* __LINUX_PCS_AIROHA_H */
