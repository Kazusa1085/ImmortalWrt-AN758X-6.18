/* SPDX-License-Identifier: GPL-2.0-only */
#ifndef _NET_L2TP_OFFLOAD_H
#define _NET_L2TP_OFFLOAD_H

#include <linux/notifier.h>
#include <linux/types.h>

struct l2tp_session;

/**
 * enum l2tp_offload_event_type - L2TP data-plane lifecycle events
 * @L2TP_OFFLOAD_SESSION_CREATED: a session was allocated
 * @L2TP_OFFLOAD_SESSION_DELETED: a session is being torn down
 * @L2TP_OFFLOAD_TX: a session packet is about to be encapsulated
 *
 * The TX event is emitted with the tunnel socket lock held. Consumers must
 * not sleep and must copy any header bytes they need before returning.
 */
enum l2tp_offload_event_type {
	L2TP_OFFLOAD_SESSION_CREATED,
	L2TP_OFFLOAD_SESSION_DELETED,
	L2TP_OFFLOAD_TX,
};

/**
 * struct l2tp_offload_event - L2TP session/data-plane snapshot
 * @type: event type
 * @tunnel_id: local tunnel ID
 * @session_id: local session ID
 * @peer_tunnel_id: peer tunnel ID
 * @peer_session_id: peer session ID
 * @version: L2TP protocol version
 * @encap: L2TP encapsulation type
 * @hdr: L2TP header for TX events, %NULL otherwise
 * @hdr_len: number of bytes in @hdr
 */
struct l2tp_offload_event {
	enum l2tp_offload_event_type type;
	u32 tunnel_id;
	u32 session_id;
	u32 peer_tunnel_id;
	u32 peer_session_id;
	u8 version;
	u8 encap;
	const u8 *hdr;
	unsigned int hdr_len;
};

int l2tp_offload_register(struct notifier_block *nb);
void l2tp_offload_unregister(struct notifier_block *nb);

#endif /* _NET_L2TP_OFFLOAD_H */
