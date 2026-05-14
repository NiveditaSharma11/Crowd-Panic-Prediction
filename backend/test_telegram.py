import asyncio
import aiohttp

async def test():
    url = "https://api.telegram.org/bot8708089025:AAGkuh_RZOr6bBmmuvwFV3KQsrjk0JQ7fv8/sendMessage"
    async with aiohttp.ClientSession() as s:
        r = await s.post(url, json={
            "chat_id": 5830942125,
            "text": "CrowdGuard AI connected! You will receive danger alerts here.",
        })
        print(await r.text())

asyncio.run(test())
