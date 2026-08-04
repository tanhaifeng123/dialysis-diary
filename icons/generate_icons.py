#!/usr/bin/env python3
"""生成 PWA 应用图标"""
from PIL import Image, ImageDraw, ImageFont
import os

ICON_DIR = os.path.dirname(os.path.abspath(__file__))

def create_icon(size, filename):
    """生成圆角图标"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 圆角背景
    margin = int(size * 0.05)
    radius = int(size * 0.22)
    
    # 背景渐变（从蓝到绿）
    bg_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg_img)
    
    # 绘制圆角矩形背景
    bg_draw.rounded_rectangle(
        [0, 0, size - 1, size - 1],
        radius=radius,
        fill=(25, 118, 210, 255)  # #1976D2
    )
    
    # 添加底部绿色条
    bar_height = int(size * 0.12)
    bar_y = int(size * 0.85)
    bg_draw.rounded_rectangle(
        [int(size * 0.15), bar_y, int(size * 0.85), bar_y + bar_height],
        radius=int(bar_height * 0.3),
        fill=(0, 191, 166, 255)  # #00BFA6
    )
    
    # 绘制水滴形状（代表透析/血液）
    drop_cx = size // 2
    drop_top = int(size * 0.18)
    drop_bottom = int(size * 0.75)
    drop_width = int(size * 0.3)
    
    # 水滴
    drop_points = []
    # 顶部尖角
    drop_points.append((drop_cx, drop_top))
    # 右侧曲线
    for i in range(30):
        angle = 1.57 + (i / 29) * 3.14
        x = drop_cx + drop_width * 0.5 * (1 + 0.3 * (1 - i/29))
        y = drop_top + int((drop_bottom - drop_top) * (i / 29) ** 0.6)
        drop_points.append((x, y))
    # 底部圆弧
    for i in range(30):
        angle = 3.14 + (i / 29) * 3.14
        import math
        x = drop_cx + drop_width * 0.65 * math.cos(angle - math.pi)
        y = (drop_top + drop_bottom) // 2 + (drop_bottom - drop_top) * 0.4 * math.sin(angle - math.pi) + drop_width * 0.2
        if y > drop_bottom:
            y = drop_bottom
        if i > 0 and i < 29:
            drop_points.append((x, y))
    
    # 简化水滴：用椭圆 + 三角形
    drop_points = [(drop_cx, drop_top)]
    # 右半
    import math
    for i in range(20):
        t = i / 19
        angle = math.pi * 0.5 + t * math.pi
        rx = drop_width * 0.55
        ry = (drop_bottom - drop_top) * 0.45
        cx = drop_cx
        cy = (drop_top + drop_bottom) // 2 + (drop_bottom - drop_top) * 0.1
        x = cx + rx * math.cos(angle)
        y = cy + ry * math.sin(angle) * 0.9
        drop_points.append((x, y))
    
    draw_on = bg_draw
    
    # 绘制白色水滴
    drop_points_closed = drop_points + [(drop_cx, drop_top)]
    draw_on.polygon(drop_points_closed, fill=(255, 255, 255, 240))
    
    # 水滴内的红十字（医疗标志）
    cross_size = int(size * 0.08)
    cross_cx = drop_cx
    cross_cy = int(size * 0.48)
    
    # 竖条
    draw_on.rectangle(
        [cross_cx - cross_size // 3, cross_cy - cross_size,
         cross_cx + cross_size // 3, cross_cy + cross_size],
        fill=(229, 57, 53, 255)  # #E53935
    )
    # 横条
    draw_on.rectangle(
        [cross_cx - cross_size, cross_cy - cross_size // 3,
         cross_cx + cross_size, cross_cy + cross_size // 3],
        fill=(229, 57, 53, 255)  # #E53935
    )
    
    img = Image.alpha_composite(img, bg_img)
    img.save(os.path.join(ICON_DIR, filename))
    print(f"生成: {filename} ({size}x{size})")

# 生成 SVG 图标
svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1976D2"/>
      <stop offset="100%" style="stop-color:#1565C0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- 水滴 -->
  <path d="M256 100 C256 100, 180 220, 180 320 C180 380, 215 410, 256 410 C297 410, 332 380, 332 320 C332 220, 256 100, 256 100 Z" fill="#FFFFFF"/>
  <!-- 红十字 -->
  <rect x="244" y="250" width="24" height="80" fill="#E53935" rx="4"/>
  <rect x="216" y="278" width="80" height="24" fill="#E53935" rx="4"/>
  <!-- 底部绿色条 -->
  <rect x="77" y="437" width="358" height="30" rx="15" fill="#00BFA6"/>
</svg>'''

with open(os.path.join(ICON_DIR, 'icon.svg'), 'w', encoding='utf-8') as f:
    f.write(svg_content)
print("生成: icon.svg")

# 生成不同尺寸 PNG
create_icon(192, 'icon-192.png')
create_icon(512, 'icon-512.png')
print("所有图标生成完成！")
