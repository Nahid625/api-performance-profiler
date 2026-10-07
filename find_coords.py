from PIL import Image, ImageDraw

img = Image.open("/home/nahid/Pictures/Screenshots/Screenshot from 2026-09-28 09-55-21.png")
draw = ImageDraw.Draw(img)

# Draw a grid of boxes
for x in range(200, 800, 100):
    for y in range(100, 800, 100):
        draw.rectangle([x, y, x+90, y+90], outline="blue")
        draw.text((x+5, y+5), f"{x},{y}", fill="yellow")

img.save("/home/nahid/Pictures/grid.png")
