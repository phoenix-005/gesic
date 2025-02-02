import * as Tone from "tone";

export const noteMappings = {
    5: "C5",
    7: "D5",
    9: "E5",
    11: "F5",
    13: "G5",
    15: "A5",
    17: "B5",
    19: "C6",
};

const buildSamplerMapping = () => {
    const mapping = {};
    Object.values(noteMappings).forEach((note) => {
        mapping[note] = `${note}.mp3`;
    });
    return mapping;
};

export const samplerMapping = buildSamplerMapping();

export function createSynthSampler(baseUrl = "/samples/violin/") {
    return new Tone.Sampler({
        urls: samplerMapping,
        baseUrl: baseUrl,
    })
        .toDestination()
        .chain(new Tone.Reverb({ decay: 4, preDelay: 0.01 }).toDestination());
}
