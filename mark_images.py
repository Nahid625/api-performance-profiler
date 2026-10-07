from PIL import Image, ImageDraw

def draw_box(image_path, out_path, boxes, text=""):
    try:
        img = Image.open(image_path)
        draw = ImageDraw.Draw(img)
        for box in boxes:
            x1, y1, x2, y2 = box
            # Draw a thick red rectangle
            for i in range(4):
                draw.rectangle([x1-i, y1-i, x2+i, y2+i], outline="red")
        img.save(out_path)
        print(f"Saved {out_path}")
    except Exception as e:
        print(f"Error on {image_path}: {e}")

base_dir = "/home/nahid/Pictures/Screenshots"

# 1. Marketplace pic
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-53-26.png", 
         f"{base_dir}/Screenshot_Marketplace_marked.png",
         [(210, 80, 750, 250)])

# 2. Empty Sidebar / Setup (maybe just mark the sidebar area)
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-53-44.png", 
         f"{base_dir}/Screenshot_Sidebar_Setup_marked.png",
         [(60, 50, 350, 150)])

# 3. Load Test Option
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-55-21.png", 
         f"{base_dir}/Screenshot_LoadTest_marked.png",
         [(240, 335, 450, 355), (240, 400, 450, 420)]) # Mark a couple of CodeLens

# 4. Route Latency & Populated Sidebar
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-55-37.png", 
         f"{base_dir}/Screenshot_Inline_Latency_marked.png",
         [(420, 305, 530, 325), (405, 420, 480, 440), (50, 80, 300, 210)]) # Inline latency and Sidebar list

