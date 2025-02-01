import React, { useEffect, useRef } from "react";

const WebcamDisplay = () => {
    const videoRef = useRef(null);

    useEffect(() => {
        const startWebcam = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (error) {
                console.error("Error accessing webcam:", error);
            }
        };

        startWebcam();
    }, []);

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#000", margin: "2px" }}>
            <video ref={videoRef} autoPlay style={{ width: "90%", maxWidth: "1000px", border: "5px solid #fff", borderRadius: "10px", transform: "scaleX(-1)" }}></video>
        </div>
    );
};

export default WebcamDisplay;
