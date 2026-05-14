import asyncio
import aiohttp
from datetime import datetime

# ══════════════════════════════════════════════════════
# TELEGRAM ALERT CONFIGURATION
# Replace with your actual bot token and chat IDs
# ══════════════════════════════════════════════════════
TELEGRAM_BOT_TOKEN = "8708089025:AAGkuh_RZOr6bBmmuvwFV3KQsrjk0JQ7fv8"

# Add all chat IDs that should receive alerts
ALERT_RECIPIENTS = [
    5830942125,  # Aditya
    # Add more chat IDs here for other phones
]

# Alert threshold — send notification when people count exceeds this
PEOPLE_THRESHOLD = 70  # people count

# Cooldown — don't spam, wait this many seconds before next alert
ALERT_COOLDOWN_SECONDS = 60

# ══════════════════════════════════════════════════════

_last_alert_time  = 0.0
_last_alert_count = 0

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"


def _danger_emoji(level: int) -> str:
    if level >= 70:
        return "🚨🚨🚨"
    elif level >= 40:
        return "⚠️"
    else:
        return "🔔"


def _build_message(stats: dict) -> str:
    level    = stats.get("danger_level", 0)
    people   = stats.get("people_count", 0)
    density  = stats.get("density", 0.0)
    dlabel   = stats.get("density_label", "Unknown")
    speed    = stats.get("speed_index", 0.0)
    frame    = stats.get("frame", 0)
    now      = datetime.now().strftime("%H:%M:%S")
    emoji    = _danger_emoji(level)

    return (
        f"{emoji} *CrowdGuard AI Alert*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🚨 *Crowd threshold exceeded!*\n"
        f"👥 *People Count:* `{people}` _(threshold: {PEOPLE_THRESHOLD})_\n"
        f"🎯 *Danger Level:* `{level}%`\n"
        f"📊 *Crowd Density:* `{density:.2f}` ({dlabel})\n"
        f"💨 *Speed Index:* `{speed}`\n"
        f"🕐 *Time:* `{now}`\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"⚠️ Monitor the situation and position security personnel."
    )


async def send_alert(stats: dict):
    """
    Send a Telegram alert when people count exceeds PEOPLE_THRESHOLD.
    """
    global _last_alert_time, _last_alert_count

    people = stats.get("people_count", 0)
    level  = stats.get("danger_level", 0)

    # Only alert if people count exceeds threshold
    if people < PEOPLE_THRESHOLD:
        return

    # Cooldown check
    now = asyncio.get_event_loop().time()
    if now - _last_alert_time < ALERT_COOLDOWN_SECONDS:
        return

    # Only alert if count increased significantly (avoid repeat at same level)
    if people <= _last_alert_count and _last_alert_count > 0:
        return

    _last_alert_time  = now
    _last_alert_count = people

    message = _build_message(stats)

    async with aiohttp.ClientSession() as session:
        for chat_id in ALERT_RECIPIENTS:
            try:
                payload = {
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "Markdown"
                }
                async with session.post(TELEGRAM_API, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        print(f"[Telegram] Alert sent to {chat_id} (people={people})")
                    else:
                        body = await resp.text()
                        print(f"[Telegram] Failed for {chat_id}: {resp.status} — {body}")
            except Exception as e:
                print(f"[Telegram] Error sending to {chat_id}: {e}")


def reset_alert_state():
    """Call this when a new stream starts to reset cooldown."""
    global _last_alert_time, _last_alert_count
    _last_alert_time  = 0.0
    _last_alert_count = 0
