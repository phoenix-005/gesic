export const drawPose = (pose, ctx) => {
    ctx.fillStyle = "red";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;

    pose.keypoints.forEach((point) => {
        if (point.score > 0.5) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
            ctx.fill();
        }
    });

    const connections = [
        ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
        ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
        ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
        ["right_hip", "right_knee"], ["right_knee", "right_ankle"]
    ];

    connections.forEach(([p1, p2]) => {
        const keypoint1 = pose.keypoints.find((kp) => kp.name === p1);
        const keypoint2 = pose.keypoints.find((kp) => kp.name === p2);

        if (keypoint1 && keypoint2 && keypoint1.score > 0.5 && keypoint2.score > 0.5) {
            ctx.beginPath();
            ctx.moveTo(keypoint1.x, keypoint1.y);
            ctx.lineTo(keypoint2.x, keypoint2.y);
            ctx.stroke();
        }
    });
};
