#!/bin/bash

# ----------------------------------------
# Image Optimization Pipeline
# - Resizes originals into multiple sizes
# - Converts to WebP
# - Generates thumbnails
# - Requires: ImageMagick (magick)
# ----------------------------------------

INPUT_DIR="images/originals"
OUTPUT_DIR="images/web"

# Sizes (max width)
SIZES=(600 1200 2000)
THUMB_SIZE=300

# Create directories if missing
mkdir -p "$INPUT_DIR"
mkdir -p "$OUTPUT_DIR"

for size in "${SIZES[@]}"; do
    mkdir -p "$OUTPUT_DIR/$size"
done

mkdir -p "$OUTPUT_DIR/thumbnails"

echo "----------------------------------------"
echo "Image Optimization Script Starting..."
echo "Source: $INPUT_DIR"
echo "Output: $OUTPUT_DIR"
echo "----------------------------------------"

# Process each image
shopt -s nullglob
for img in "$INPUT_DIR"/*.{jpg,jpeg,png,JPG,JPEG,PNG}; do
    filename=$(basename "$img")
    name="${filename%.*}"

    echo ""
    echo "⇒ Processing: $filename"

    # Create resized versions
    for size in "${SIZES[@]}"; do
        output="$OUTPUT_DIR/$size/${name}-${size}.webp"
        
        if [[ ! -f "$output" ]]; then
            echo "   • Generating ${size}px → $output"
            magick "$img" \
                -resize "${size}x" \
                -quality 82 \
                "$output"
        else
            echo "   • Skipping ${size}px (exists)"
        fi
    done

    # Thumbnail
    thumb="$OUTPUT_DIR/thumbnails/${name}-thumb.webp"
    if [[ ! -f "$thumb" ]]; then
        echo "   • Generating thumbnail (${THUMB_SIZE}px) → $thumb"
        magick "$img" \
            -resize "${THUMB_SIZE}x" \
            -quality 80 \
            "$thumb"
    else
        echo "   • Skipping thumbnail (exists)"
    fi

done

echo ""
echo "----------------------------------------"
echo "Image Optimization Complete."
echo "Generated sizes: ${SIZES[@]} and thumbnail ${THUMB_SIZE}px"
echo "Output directory: $OUTPUT_DIR"
echo "----------------------------------------"
