# Clipboard Personal Session Copywriting

This file defines new i18n keys for the fixed personal session flow.

Target files:

- `web/i18n/*/clipboard.json`
- Optional helper keys in `web/i18n/*/general.json`

## New Keys (clipboard.json)

| Key | English Copy |
| --- | --- |
| `entry.personal_transfer` | Transfer Between My Devices |
| `entry.random_transfer` | Create Random Session |
| `entry.personal_default_hint` | Signed-in users use personal session by default. |
| `entry.switch_to_random` | Use Random Session Instead |
| `personal.session_code` | Personal Session Code |
| `personal.open` | Open My Session |
| `personal.join` | Join My Session |
| `personal.reset_code` | Reset Session Code |
| `personal.reset_confirm` | Resetting will disconnect current devices. Continue? |
| `personal.waiting_other_device` | Waiting for your other device to join |
| `personal.auto_opening` | Opening your personal session... |
| `personal.mode_badge` | Personal Session |
| `personal.max_devices_notice` | Personal session supports up to 2 devices online. |

## Error and Status Keys (clipboard.json -> messages)

| Key | English Copy |
| --- | --- |
| `messages.personal_session_forbidden` | This session can only be joined by the same account. |
| `messages.session_full_online` | Two devices are online. Disconnect one device first. |
| `messages.personal_code_rotated` | Session code was reset. Please reopen your personal session. |
| `messages.device_replaced_offline` | An offline device was replaced by this device. |
| `messages.open_personal_failed` | Failed to open personal session. You can switch to random session. |
| `messages.join_personal_failed` | Failed to join personal session. Please retry. |

## Download-Flow Prompt Keys

Used on "transfer after download" action.

| Key | English Copy |
| --- | --- |
| `download.transfer_default_personal` | Transfer to My Devices |
| `download.transfer_default_personal_hint` | This file will be added to your personal session. |
| `download.transfer_fallback_random` | Not signed in? Use random session. |

## Placement Guidance

- In session entry area:
  - Primary action: `entry.personal_transfer` when signed in.
  - Secondary action: `entry.random_transfer`.
- In transfer dialog after download:
  - Primary button: `download.transfer_default_personal`.
  - Helper text: `download.transfer_default_personal_hint`.
  - Secondary link/button: `entry.switch_to_random`.
- In personal session panel:
  - Show `personal.session_code` and `personal.mode_badge`.
  - Show `personal.max_devices_notice` below device list.

## Translation Rollout

For MVP, add full strings to:

- `en`
- `zh`

For other locales (`de`, `es`, `fr`, `ja`, `ko`, `ru`, `th`, `vi`), use temporary English fallback first, then complete localization in a follow-up batch.
