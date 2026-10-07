from PIL import Image, ImageDraw

def draw_box(image_path, out_path, boxes):
    try:
        img = Image.open(image_path)
        draw = ImageDraw.Draw(img)
        for box in boxes:
            x1, y1, x2, y2 = box
            # Draw a thick red rectangle (thickness = 4)
            for i in range(4):
                draw.rectangle([x1-i, y1-i, x2+i, y2+i], outline="red")
        img.save(out_path)
        print(f"Saved {out_path}")
    except Exception as e:
        print(f"Error on {image_path}: {e}")

base_dir = "/home/nahid/Pictures/Screenshots"
out_dir = "/home/nahid/Pictures"

# 1. Marketplace (Image 1) - Correct from before
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-53-26.png", 
         f"{out_dir}/app-mrk-1.png",
         [(210, 80, 750, 250)])

# 2. Sidebar Setup (Image 2) - Correct from before
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-53-44.png", 
         f"{out_dir}/app-mrk-2.png",
         [(60, 50, 350, 150)])

# 3. Load Test Option (Image 3) - Accurate CodeLens coordinates
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-55-21.png", 
         f"{out_dir}/app-mrk-3.png",
         [
             (248, 258, 410, 275), # Line 17
             (248, 342, 410, 360), # Line 21
             (248, 442, 410, 460), # Line 26
             (248, 528, 410, 545)  # Line 30
         ])

# 4. Route Latency & Populated Sidebar (Image 4) - Accurate coordinates
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-55-37.png", 
         f"{out_dir}/app-mrk-4.png",
         [
             # Sidebar list of routes
             (60, 95, 230, 225),
             
             # Inline latency (green/yellow dots)
             (425, 310, 525, 332), # Line 21
             (405, 410, 495, 432), # Line 26
             (410, 500, 505, 522), # Line 30
             (410, 725, 500, 747)  # Line 42
         ])
