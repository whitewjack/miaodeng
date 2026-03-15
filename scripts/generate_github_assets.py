#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    extra_site = Path("/tmp/sso_pillow")
    if extra_site.exists():
        sys.path.insert(0, str(extra_site))
    from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "assets" / "github"
FONT_STACK = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',Arial,sans-serif"
FONT_CANDIDATES = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]
BG_TOP = (23, 35, 94)
BG_BOTTOM = (10, 16, 47)
PANEL = (16, 24, 70)
PANEL_LINE = (60, 78, 145)
WHITE = (255, 255, 255)
TEXT_SOFT = (201, 215, 255)
TEXT_MUTED = (159, 176, 232)
TEXT_DIM = (127, 147, 214)
BLUE = (126, 158, 255)
PURPLE = (110, 89, 247)
GREEN = (23, 194, 123)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size=size, index=0)
            except Exception:
                continue
    return ImageFont.load_default()


FONT_CACHE: dict[tuple[int, bool], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    key = (size, bold)
    if key not in FONT_CACHE:
        FONT_CACHE[key] = font(size, bold=bold)
    return FONT_CACHE[key]


def banner_svg() -> str:
    return f"""<svg width="1280" height="640" viewBox="0 0 1280 640" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="80" y1="40" x2="1196" y2="620" gradientUnits="userSpaceOnUse">
      <stop stop-color="#17235E"/>
      <stop offset="1" stop-color="#0A102F"/>
    </linearGradient>
    <linearGradient id="accent" x1="226" y1="138" x2="1000" y2="520" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7E9EFF"/>
      <stop offset="1" stop-color="#6E59F7"/>
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1280" height="640" rx="36" fill="url(#bg)"/>
  <circle cx="1128" cy="104" r="168" fill="#7A5DF5" fill-opacity="0.17"/>
  <circle cx="116" cy="546" r="206" fill="#7F9BFF" fill-opacity="0.12"/>

  <rect x="84" y="78" width="378" height="46" rx="23" fill="#FFFFFF" fill-opacity="0.08"/>
  <text x="116" y="108" fill="#D5E0FF" font-size="22" font-family="{FONT_STACK}">自托管内部 SSO / Self-hosted internal SSO toolkit</text>

  <text x="84" y="210" fill="white" font-size="92" font-weight="700" font-family="{FONT_STACK}">秒登 MiaoDeng</text>
  <text x="84" y="286" fill="#DCE6FF" font-size="36" font-weight="700" font-family="{FONT_STACK}">自动登录门户 + Chrome 插件</text>
  <text x="84" y="330" fill="#AFC0F6" font-size="28" font-family="{FONT_STACK}">Self-hosted portal + Chrome extension for configurable auto-login</text>
  <text x="84" y="390" fill="#A3B6F0" font-size="25" font-family="{FONT_STACK}">规则中心 · OTP / TOTP / Token · 审计日志 · Docker</text>
  <text x="84" y="426" fill="#96A8E6" font-size="23" font-family="{FONT_STACK}">Rule Center · OTP / TOTP / Token · Audit · Backups · Docker</text>

  <rect x="84" y="470" width="660" height="104" rx="26" fill="#FFFFFF" fill-opacity="0.06" stroke="#FFFFFF" stroke-opacity="0.14"/>
  <text x="118" y="516" fill="#E8EEFF" font-size="24" font-weight="700" font-family="{FONT_STACK}">统一系统入口，沉淀可复用登录规则，减少重复登录操作</text>
  <text x="118" y="554" fill="#B8C7F4" font-size="22" font-family="{FONT_STACK}">Unify system access, reuse login rules, and finish high-frequency sign-in faster.</text>

  <g filter="url(#softGlow)">
    <rect x="848" y="144" width="338" height="330" rx="34" fill="#0F1742" stroke="#4356A4" stroke-opacity="0.68"/>
  </g>
  <rect x="884" y="186" width="266" height="42" rx="21" fill="#FFFFFF" fill-opacity="0.08"/>
  <rect x="884" y="248" width="266" height="42" rx="21" fill="#FFFFFF" fill-opacity="0.08"/>
  <rect x="884" y="310" width="266" height="42" rx="21" fill="#FFFFFF" fill-opacity="0.08"/>
  <rect x="884" y="374" width="142" height="30" rx="15" fill="url(#accent)"/>
  <text x="904" y="174" fill="#8DABFF" font-size="24" font-weight="700" font-family="{FONT_STACK}">⚡ 秒登 / MiaoDeng</text>
  <text x="904" y="214" fill="#DDE6FF" font-size="18" font-family="{FONT_STACK}">服务地址 / Server URL</text>
  <text x="904" y="276" fill="#DDE6FF" font-size="18" font-family="{FONT_STACK}">用户 / User</text>
  <text x="904" y="338" fill="#DDE6FF" font-size="18" font-family="{FONT_STACK}">规则 / Rules</text>
  <text x="884" y="516" fill="#9AAEEB" font-size="20" font-family="{FONT_STACK}">开源版 / GitHub-ready open source</text>
</svg>
"""


def round_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width: int = 1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], content: str, size: int, fill, bold: bool = False):
    draw.text(xy, content, font=get_font(size, bold), fill=fill)


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], content: str, size: int, fill, bold: bool = False):
    f = get_font(size, bold)
    left, top, right, bottom = draw.textbbox((0, 0), content, font=f)
    w = right - left
    h = bottom - top
    x = box[0] + ((box[2] - box[0]) - w) / 2
    y = box[1] + ((box[3] - box[1]) - h) / 2 - 2
    draw.text((x, y), content, font=f, fill=fill)


def background() -> Image.Image:
    img = Image.new("RGBA", (960, 540), BG_BOTTOM)
    px = img.load()
    for y in range(img.height):
        ratio = y / max(1, img.height - 1)
        r = int(BG_TOP[0] * (1 - ratio) + BG_BOTTOM[0] * ratio)
        g = int(BG_TOP[1] * (1 - ratio) + BG_BOTTOM[1] * ratio)
        b = int(BG_TOP[2] * (1 - ratio) + BG_BOTTOM[2] * ratio)
        for x in range(img.width):
            px[x, y] = (r, g, b, 255)
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse((760, -20, 970, 190), fill=(122, 93, 245, 40))
    gdraw.ellipse((-40, 370, 210, 620), fill=(127, 155, 255, 32))
    return Image.alpha_composite(img, glow)


def draw_progress(draw: ImageDraw.ImageDraw, active_index: int):
    labels = ["门户 / Portal", "规则 / Rule", "填充 / Fill", "登录 / Sign in"]
    x = 92
    for idx, label in enumerate(labels):
        box = (x + idx * 170, 486, x + idx * 170 + 146, 518)
        active = idx <= active_index
        fill = BLUE if active else (32, 45, 104)
        round_rect(draw, box, 16, fill=fill)
        centered_text(draw, box, label, 16, (13, 20, 56) if active else TEXT_MUTED, bold=True)


def draw_frame(
    *,
    step: int,
    title_cn: str,
    title_en: str,
    subtitle_cn: str,
    subtitle_en: str,
    status_cn: str,
    status_en: str,
    rule_active: bool,
    filled: bool,
    success: bool,
) -> Image.Image:
    img = background()
    draw = ImageDraw.Draw(img)

    round_rect(draw, (44, 32, 916, 102), 20, fill=(36, 50, 112))
    text(draw, (72, 52), f"{step}. {title_cn}", 28, (232, 238, 255), bold=True)
    text(draw, (72, 82), title_en, 18, (183, 200, 247))
    text(draw, (560, 52), subtitle_cn, 16, TEXT_SOFT)
    text(draw, (560, 78), subtitle_en, 15, (151, 169, 231))

    round_rect(draw, (44, 132, 404, 452), 26, fill=PANEL, outline=PANEL_LINE, width=2)
    text(draw, (72, 162), "秒登门户 / Portal", 22, (221, 230, 255), bold=True)
    text(draw, (72, 194), "选择系统卡片后，插件处理后续登录动作", 15, (148, 166, 229))
    text(draw, (72, 216), "Pick a system card and let the extension finish the login flow.", 14, TEXT_DIM)

    card_fill = (31, 91, 255, 235)
    inactive_fill = (31, 45, 101)
    round_rect(draw, (72, 246, 376, 318), 20, fill=card_fill, outline=(126, 160, 255), width=2)
    text(draw, (96, 270), "ERP 生产 / ERP Production", 24, WHITE, bold=True)
    text(draw, (96, 298), "账号密码 + TOTP / Password + TOTP", 15, WHITE)
    round_rect(draw, (72, 334, 376, 382), 16, fill=inactive_fill)
    text(draw, (96, 350), "GitLab 测试 / GitLab UAT", 18, (179, 195, 243))
    round_rect(draw, (72, 394, 376, 442), 16, fill=inactive_fill)
    text(draw, (96, 410), "Jenkins 发布 / Jenkins Release", 18, (179, 195, 243))

    draw.line((420, 288, 556, 236), fill=BLUE, width=6)
    draw.ellipse((411, 279, 429, 297), fill=BLUE)
    draw.ellipse((547, 227, 565, 245), fill=PURPLE)
    text(draw, (442, 264), "点击后跳转 / jump", 15, (221, 230, 255))

    round_rect(draw, (576, 132, 916, 452), 26, fill=PANEL, outline=PANEL_LINE, width=2)
    round_rect(draw, (602, 162, 890, 350), 18, fill=(234, 240, 255))
    round_rect(draw, (602, 162, 890, 190), 18, fill=(204, 215, 245))
    draw.ellipse((619, 171, 629, 181), fill=(142, 161, 230))
    draw.ellipse((635, 171, 645, 181), fill=(142, 161, 230))
    draw.ellipse((651, 171, 661, 181), fill=(142, 161, 230))
    text(draw, (678, 171), "erp.example.com/login", 13, (93, 112, 168))

    username_value = "alice.qa" if filled or success else "等待自动填充 / pending"
    password_value = "••••••••••••" if filled or success else "等待自动填充 / pending"
    otp_value = "482 913" if filled or success else "规则匹配后自动处理 / handled by rule"

    text(draw, (624, 216), "账号 / Username", 16, (22, 33, 79), bold=True)
    round_rect(draw, (624, 228, 868, 256), 8, fill=WHITE, outline=(209, 218, 247))
    text(draw, (636, 236), username_value, 13, (88, 112, 175))
    text(draw, (624, 278), "密码 / Password", 16, (22, 33, 79), bold=True)
    round_rect(draw, (624, 290, 868, 318), 8, fill=WHITE, outline=(209, 218, 247))
    text(draw, (636, 298), password_value, 13, (88, 112, 175))
    text(draw, (624, 330), "动态码 / TOTP", 16, (22, 33, 79), bold=True)
    round_rect(draw, (624, 342, 868, 370), 8, fill=WHITE, outline=(209, 218, 247))
    text(draw, (636, 350), otp_value, 13, (88, 112, 175))
    round_rect(draw, (624, 382, 728, 414), 10, fill=(93, 119, 255))
    centered_text(draw, (624, 382, 728, 414), "登录 / Sign in", 14, WHITE, bold=True)

    round_rect(draw, (720, 204, 892, 304), 18, fill=(15, 23, 66), outline=(58, 75, 145), width=2)
    text(draw, (738, 226), "⚡ 插件 / Extension", 15, (140, 171, 255), bold=True)
    matched_fill = GREEN if rule_active else (31, 45, 101)
    round_rect(draw, (738, 238, 874, 262), 12, fill=matched_fill)
    text(draw, (748, 244), status_cn, 12, (10, 16, 47) if rule_active else (152, 172, 235), bold=True)
    text(draw, (738, 280), status_en, 12, (183, 200, 247))

    if success:
        round_rect(draw, (718, 392, 914, 470), 18, fill=(22, 84, 60), outline=(46, 213, 143), width=2)
        text(draw, (738, 420), "✅ 登录完成 / Signed in", 22, (232, 255, 245), bold=True)
        text(draw, (738, 450), "浏览器已跳转目标系统 / Redirected to target system", 15, (199, 246, 223))

    text(draw, (48, 470), "示意演示 / Illustrative demo", 14, TEXT_DIM)
    draw_progress(draw, step - 1)
    return img.convert("P", palette=Image.ADAPTIVE, colors=128)


def build_gif() -> None:
    steps = [
        dict(
            step=1,
            title_cn="点击系统卡片",
            title_en="Click a system card",
            subtitle_cn="从门户入口发起跳转",
            subtitle_en="Start from the portal launcher",
            status_cn="等待规则匹配",
            status_en="Waiting for rule match",
            rule_active=False,
            filled=False,
            success=False,
        ),
        dict(
            step=2,
            title_cn="打开登录页并识别规则",
            title_en="Open login page and detect the rule",
            subtitle_cn="插件根据域名和页面结构命中规则",
            subtitle_en="The extension matches a rule from URL and page structure",
            status_cn="已匹配登录规则",
            status_en="Rule matched",
            rule_active=True,
            filled=False,
            success=False,
        ),
        dict(
            step=3,
            title_cn="自动填充账号与验证码",
            title_en="Auto-fill credentials and verification code",
            subtitle_cn="自动注入用户名、密码与 TOTP",
            subtitle_en="Auto-fill username, password, and TOTP",
            status_cn="已自动填充",
            status_en="Credentials filled",
            rule_active=True,
            filled=True,
            success=False,
        ),
        dict(
            step=4,
            title_cn="自动提交并完成登录",
            title_en="Auto-submit and sign in",
            subtitle_cn="浏览器完成跳转并进入目标系统",
            subtitle_en="The browser submits the form and lands in the target system",
            status_cn="登录流程已完成",
            status_en="Sign-in complete",
            rule_active=True,
            filled=True,
            success=True,
        ),
    ]

    frames = [draw_frame(**step) for step in steps]
    durations = [1100, 1100, 1100, 1800]
    output = OUT_DIR / "login-flow.gif"
    frames[0].save(
        output,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write(OUT_DIR / "banner.svg", banner_svg())
    build_gif()
    print(f"Generated assets in {OUT_DIR}")


if __name__ == "__main__":
    main()
