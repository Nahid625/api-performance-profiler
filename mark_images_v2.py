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

# Image 1 (Marketplace)
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-53-26.png", 
         f"{out_dir}/app-mrk-1.png",
         [(210, 80, 750, 250)])

# Image 2 (Sidebar Setup)
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-53-44.png", 
         f"{out_dir}/app-mrk-2.png",
         [(60, 50, 350, 150)])

# Image 3 (Load Test) - CodeLens above routes
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-55-21.png", 
         f"{out_dir}/app-mrk-3.png",
         [
             (320, 280, 580, 320), # Line 17
             (320, 360, 580, 400), # Line 21
             (320, 460, 580, 500), # Line 26
             (320, 540, 580, 580)  # Line 30
         ])

# Image 4 (Populated Sidebar & Inline Latency)
draw_box(f"{base_dir}/Screenshot from 2026-09-28 09-55-37.png", 
         f"{out_dir}/app-mrk-4.png",
         [
             # Sidebar list of routes
             (50, 100, 320, 250),
             
             # Inline latency (green/yellow dots)
             (630, 400, 820, 440), # Line 21
             (630, 500, 820, 540), # Line 26
             (630, 580, 820, 620)  # Line 30
         ])
