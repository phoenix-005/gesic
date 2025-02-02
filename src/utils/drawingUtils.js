export const smoothPath = (points, iterations = 2) => {
    let smoothed = points.slice();
    for (let iter = 0; iter < iterations; iter++) {
        smoothed = smoothed.map((p, i, arr) => {
            if (i === 0 || i === arr.length - 1) return p;
            return {
                x: (arr[i - 1].x + arr[i].x + arr[i + 1].x) / 3,
                y: (arr[i - 1].y + arr[i].y + arr[i + 1].y) / 3,
                t: p.t,
                note: p.note,
            };
        });
    }
    return smoothed;
};

export const drawVariableWidthStroke = (ctx, points, maxWidth, gradientCallback) => {
    if (points.length < 2) return;

    let distances = [0];
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        distances.push(distances[i - 1] + Math.hypot(dx, dy));
    }
    const totalLength = distances[points.length - 1];

    const thicknesses = points.map((p, i) => {
        const t = totalLength === 0 ? 0 : distances[i] / totalLength;
        return maxWidth * (1 - Math.abs(t - 0.5) * 2) || 1;
    });

    const leftOffsets = [];
    const rightOffsets = [];
    for (let i = 0; i < points.length; i++) {
        let dx, dy;
        if (i === 0) {
            dx = points[i + 1].x - points[i].x;
            dy = points[i + 1].y - points[i].y;
        } else if (i === points.length - 1) {
            dx = points[i].x - points[i - 1].x;
            dy = points[i].y - points[i - 1].y;
        } else {
            dx = points[i + 1].x - points[i - 1].x;
            dy = points[i + 1].y - points[i - 1].y;
        }
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const perpX = -dy;
        const perpY = dx;
        const halfWidth = thicknesses[i];
        leftOffsets.push({
            x: points[i].x + perpX * halfWidth,
            y: points[i].y + perpY * halfWidth,
        });
        rightOffsets.push({
            x: points[i].x - perpX * halfWidth,
            y: points[i].y - perpY * halfWidth,
        });
    }

    ctx.beginPath();
    ctx.moveTo(leftOffsets[0].x, leftOffsets[0].y);
    for (let i = 0; i < leftOffsets.length - 1; i++) {
        const midX = (leftOffsets[i].x + leftOffsets[i + 1].x) / 2;
        const midY = (leftOffsets[i].y + leftOffsets[i + 1].y) / 2;
        ctx.quadraticCurveTo(leftOffsets[i].x, leftOffsets[i].y, midX, midY);
    }
    ctx.lineTo(leftOffsets[leftOffsets.length - 1].x, leftOffsets[leftOffsets.length - 1].y);
    for (let i = rightOffsets.length - 1; i > 0; i--) {
        const midX = (rightOffsets[i].x + rightOffsets[i - 1].x) / 2;
        const midY = (rightOffsets[i].y + rightOffsets[i - 1].y) / 2;
        ctx.quadraticCurveTo(rightOffsets[i].x, rightOffsets[i].y, midX, midY);
    }
    ctx.lineTo(rightOffsets[0].x, rightOffsets[0].y);
    ctx.closePath();

    if (typeof gradientCallback === "function") {
        ctx.fillStyle = gradientCallback(points);
    }
    ctx.fill();
};
