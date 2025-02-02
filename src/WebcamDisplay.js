import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs-core";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import "@tensorflow/tfjs-backend-webgl"; // Register WebGL backend
import * as Tone from "tone"; // Import Tone.js for music

const WebcamDisplay = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [detector, setDetector] = useState(null);

    // Initialize Tone.js Synth
    const synth = useRef(new Tone.Synth().toDestination());

    useEffect(() => {
        const startWebcam = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: "user",
                    },
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    console.log("✅ Webcam started successfully.");
                }
            } catch (error) {
                console.error("❌ Error accessing webcam:", error);
            }
        };

        const loadHandPose = async () => {
            try {
                console.log("⏳ Setting TensorFlow.js backend...");
                await tf.setBackend("webgl");
                await tf.ready();
                console.log("✅ TensorFlow.js is ready!");

                const model = handPoseDetection.SupportedModels.MediaPipeHands;
                const detectorConfig = {
                    runtime: "tfjs",
                    modelType: "full",
                    maxHands: 2,
                };

                const handDetector = await handPoseDetection.createDetector(model, detectorConfig);
                setDetector(handDetector);
                console.log("✅ Hand Pose model loaded successfully!");
            } catch (error) {
                console.error("❌ Error loading BlazePose model:", error);
            }
        };

        startWebcam();
        loadHandPose();
    }, []);

    const mapPositionToNote = (y) => {
        // Map vertical position (y) to musical notes
        const notes = [
            "C4", "C4 + 50c", "C#4", "C#4 + 50c", "D4", "D4 + 50c", "D#4", "D#4 + 50c", "E4",
            "F4", "F4 + 50c", "F#4", "F#4 + 50c", "G4", "G4 + 50c", "G#4", "G#4 + 50c", "A4",
            "A4 + 50c", "A#4", "A#4 + 50c", "B4", "C5"
          ].map(note => Tone.Frequency(note).toFrequency());
        const index = Math.floor((y / window.innerHeight) * notes.length);
        return notes[Math.min(index, notes.length - 1)];
    };

    useEffect(() => {
        if (!detector) return;

        const detectPose = async () => {
            try {
                if (videoRef.current && videoRef.current.readyState === 4) {
                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext("2d");

                    canvas.width = videoRef.current.videoWidth;
                    canvas.height = videoRef.current.videoHeight;
                    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

                    const hands = await detector.estimateHands(canvas, { flipHorizontal: true });

                    if (hands.length > 0) {
                        hands.forEach((hand) => {
                            console.log(hand);

                            const note = mapPositionToNote(hand.keypoints[0].y);
                            synth.current.triggerAttackRelease(note, "8n");

                            // const wrist = hand.keypoints.find(kp => kp.name === "wrist");

                            // if (wrist && wrist.score > 0.5) {
                            //     const note = mapPositionToNote(wrist.y);
                            //     console.log(`🎵 Wrist Detected - X: ${wrist.x}, Y: ${wrist.y}, Note: ${note}`);
                            //     synth.current.triggerAttackRelease(note, "8n");
                            // }
                        });
                        // const keypoints = poses[0].keypoints;

                        // if (!keypoints || keypoints.some(kp => kp.x === null || kp.y === null || isNaN(kp.x) || isNaN(kp.y))) {
                        //     console.warn("⚠️ Pose detection returned NaN/null values. Skipping frame.");
                        //     return;
                        // }

                        // // Filter wrist movements
                        // const leftWrist = keypoints.find(kp => kp.name === "left_wrist" && kp.score > 0.9);
                        // const rightWrist = keypoints.find(kp => kp.name === "right_wrist" && kp.score > 0.9);

                        // // Trigger music based on wrist movements
                        // if (leftWrist) {
                        //     const note = mapPositionToNote(leftWrist.y);
                        //     console.log(`🖐️ Left Wrist Detected - X: ${leftWrist.x}, Y: ${leftWrist.y}, Note: ${note}`);
                        //     synth.current.triggerAttackRelease(note, "8n");
                        // }

                        // if (rightWrist) {
                        //     const note = mapPositionToNote(rightWrist.y);
                        //     console.log(`✋ Right Wrist Detected - X: ${rightWrist.x}, Y: ${rightWrist.y}, Note: ${note}`);
                        //     synth.current.triggerAttackRelease(note, "8n");
                        // }

                        // if (!leftWrist && !rightWrist) {
                        //     console.log("⚠️ No wrists detected in this frame.");
                        // }
                    } 
                    // else {
                    //     // console.log(hands.length);
                    //     console.warn("⚠️ No poses detected.");
                    // }
                }
            } catch (error) {
                console.error("❌ Error detecting pose:", error);
            }

            requestAnimationFrame(detectPose);
        };

        detectPose();
    }, [detector]);

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#000" }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: "90%", maxWidth: "1000px", border: "5px solid #fff", borderRadius: "10px", transform: "scaleX(-1)" }}></video>
            <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
    );
};

export default WebcamDisplay;
