# btop recovery and node profiles

This extends the [btop transport contract](./btop.md). Implement for today's
Ubuntu luv and NixOS joi topology. A future production-role change is not a
reason to add a deployment DSL or rename services now.

## Required behavior

After a node, exporter, relay, broker, or BFF restart, the display must recover
without an SSH login, an SSH-agent socket, or a manual consumer restart.
While its source is unavailable, retain the last display as offline.

This requires each deployed service to start after boot. NATS cannot start a
stopped collector. Control's standing exporter/relay declaration uses
unless-stopped and is now active for luv and joi, with Docker enabled at boot.
Joi's NixOS service owns its separate exporter Compose project; its relay
runs on luv. The
temporary dev acceptance stack has been retired. A real node reboot remains
a separate acceptance gate; container restart tests do not prove a host reboot.

## Physical-port profile

The network display means traffic through the selected physical Ethernet
port, not the sum of loopback, Docker bridges, tunnels, and VLAN counters.
Read-only inspection on 2026-09-10 confirmed luv's enp191s0 is a physical
Realtek Ethernet interface with the preferred default route and a negotiated
2500 Mbit/s link. enp191s0.20 is its compute VLAN, not another physical port.

Control owns a read-only node profile mounted at /etc/btop/public.conf.
The normal exporter entrypoint validates one explicit interface, namespace
visibility, a physical device in sysfs, and Ethernet interface type. It must
not silently start on btop's automatic interface fallback.

The image is shared; the profile, device visibility, addresses, and deployment
remain node-specific. Joi must validate its own port name and counters rather
than copying luv's. Joi's enp191s0 and rendered counters passed native
acceptance on 2026-09-10. Btop source stays in its own pinned source repository.

## Failure handling

- Exporter health expires after five seconds without a capture backed by new
  terminal output. A repeated screenshot cannot renew health.
- The supervised exporter exits nonzero after ten seconds without a fresh
  capture, or if an observer/capture thread dies. Losing the configured
  physical port also fails the normal entrypoint. Docker restarts the whole
  unit; no second supervisor or SSH session is involved.
- The Control relay cancels a stalled source and retries independently.
  A replacement exporter connection or broker session starts with a new
  session ID and full frame. It keeps no durable replay buffer.
- The hardened relay publishes a full snapshot every five seconds rather
  than thirty. This increases private broker traffic to reduce recovery
  delay. The existing dev page uses standing release 2026-09-10.3;
  production remains unchanged.
- The BFF consumes through synchronous NATS callbacks, not the client's
  unbounded async-iterator queue. Frame size, inventory, sequence, and SSE
  backpressure checks remain. Network/socket buffers are not a durable queue.
- BFF connection retries use one second, with connection errors logged at
  most once per five seconds. Five-second NATS pings and two unanswered
  pings detect a half-open broker path independently of node activity.
- Every browser connection starts from a fresh full snapshot. For an already
  synchronized session, the BFF converts ordinary periodic full snapshots
  into changed-cell updates. Large changes, session replacements, and
  sequence gaps still use full browser frames.

Do not equate the five-second snapshot interval with a total recovery SLA.
Connection-failure detection, retry, exporter startup, and browser scheduling
also contribute. Test these boundaries together.

## Read-only baseline

Before hardening, a 35-second sample of the isolated luv stream showed 35
frames, one 131000-byte full envelope, median 24799-byte delta envelopes,
and 27541 bytes/second including envelopes. A concurrent point sample showed
about 24.5 MiB for the exporter and 7.2 MiB for its relay. These are observations,
not a controlled benchmark or production capacity promise.

Keep comparisons separated: private NATS traffic, public SSE traffic, browser
render cost, and process memory are different budgets.

After dev promotion, another 35-second sample measured seven full NATS
snapshots plus 28 deltas (42948 bytes/second). The concurrent browser SSE
stream received one initial full frame plus 35 deltas (24455 bytes/second).
This confirms the periodic recovery snapshots did not force periodic browser
full frames in that sample; changing host activity prevents treating these
samples as a controlled before/after bandwidth benchmark.

## Fault acceptance

The automation uses the real BFF and packaged exporter/relay with a separate
internal broker. It starts no frontend or public route. It never restarts
production, the active dev acceptance stack, or a physical node.

From the portal checkout, select the owning Control checkout explicitly and
the candidate image references, then run:

    BTOP_CONTROL_CHECKOUT=/absolute/control-checkout \
    BTOP_EXPORTER_IMAGE=<candidate-exporter> \
    BTOP_RELAY_IMAGE=<candidate-relay> \
    node tests/btop-recovery/run.mjs

Control's recovery overlay provides the exporter, relay, and broker. The
portal's recovery Compose provides an automation-only BFF capped at 512 MiB
with a 384 MiB Node heap. The other caps are 256/128/64 MiB respectively.
The harness refuses an already-running recovery project and removes its
own services and disposable socket volume in cleanup.

It exercises consumers starting before their dependencies, exporter
recreation, dead and frozen collection, a paused/half-open broker path,
broker recreation, and BFF restart. Success is explicitly marked
BTOP_RECOVERY_ACCEPTANCE_PASS. These are container/process tests, not a
claim of physical joi or phone acceptance.

Verified on 2026-09-10 against packaged Control 4cf9509 and btop 4aca040:
all fault scenarios passed, including automatic exporter restarts after dead
and frozen capture. The BFF restart recovered in 5845 ms. Both fresh hardware
probes passed physical-port totals and capture lifecycle checks. The focused
real NATS/BFF/SSE suite passed. The harness removed its test containers,
network, and disposable socket volume; the existing dev stack stayed running.
After digest-selected dev promotion, Chromium and mobile-sized WebKit also
passed real frames, stale/offline recovery, visibility/page-cache recovery,
and route/Back cleanup through the existing Caddy/dev route.

## Remaining gates

The permanent Control exporter/relay now feeds the existing workspace broker.
The dev BFF no longer joins an acceptance network or selects a test broker.
Browser checks pass on that path; the isolated fault harness remains separate.

Verify native joi capture, its private listener/firewall, boot activation,
and independent restart recovery before moving its tile. Do not revive the
old luv-hosted SSH collector. Keep telemetry independent of inference health
and restart policies.

Vulkan utilization remains an unresolved counter-quality issue. An exposed
zero is not proof that a GPU is idle. Fleet-scale mobile rendering and
off-screen suspension need measurement before adding Nexus monitors.

Future broker/Control placement and NATS authentication remain in the
[multi-node plan](../../../vedanta-dhobley/docs/plans/btop-multinode.md);
node identity and the frame contract must not depend on which machine hosts
application production.
