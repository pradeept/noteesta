from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from noteesta_api.schemas import VisualSpec


def render_visual(visual: VisualSpec) -> bytes:
    """Render a validated visual specification to a deterministic PNG asset."""
    image = Image.new("RGB", (1400, 760), "#f5f8f5")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=28)
    small = ImageFont.load_default(size=20)
    ink = "#253d31"
    accent = "#4e685b"
    soft = "#e5efe6"
    line = "#a9b9ae"

    draw.text((80, 55), visual.title, fill=ink, font=font)
    if visual.kind == "bar" and visual.data:
        maximum = max(item.value for item in visual.data) or 1
        for index, item in enumerate(visual.data[:6]):
            y = 150 + index * 85
            width = int(900 * item.value / maximum)
            draw.text((80, y + 12), item.label, fill=ink, font=small)
            draw.rounded_rectangle(
                (360, y, 360 + width, y + 48), 8, fill=soft, outline=line
            )
            draw.text(
                (380 + width, y + 12),
                f"{item.value:g}{item.unit or ''}",
                fill=accent,
                font=small,
            )
    else:
        nodes = visual.nodes[:6]
        x = 180
        width = 1040
        height = 68
        gap = 24
        for index, node in enumerate(nodes):
            y = 130 + index * (height + gap)
            draw.rounded_rectangle(
                (x, y, x + width, y + height),
                14,
                fill=soft if index % 2 == 0 else "#ffffff",
                outline=line,
                width=2,
            )
            draw.text((x + 24, y + 10), node.label[:42], fill=ink, font=font)
            draw.text((x + 560, y + 19), node.detail[:52], fill=accent, font=small)
            if index < len(nodes) - 1:
                center = x + width // 2
                line_start = y + height + 5
                line_end = y + height + gap - 5
                draw.line(
                    (center, line_start, center, line_end),
                    fill=accent,
                    width=4,
                )
                draw.polygon(
                    [
                        (center, line_end),
                        (center - 9, line_end - 14),
                        (center + 9, line_end - 14),
                    ],
                    fill=accent,
                )
                if index < len(visual.edges):
                    draw.text(
                        (center + 18, line_start),
                        visual.edges[index].label[:34],
                        fill=accent,
                        font=small,
                    )

    draw.text((80, 690), visual.description[:110], fill=accent, font=small)
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
