# Brighter race countdown

User requests a youthful female countdown with a cheerful, energetic GO, inspired by KartRider. Implement in the existing English voice pack, keeping the three-second race timing and all six UI languages unchanged.

Revision 3 was rejected by the user: the voice drags, lacks brightness and does not have the requested youthful character. Revision 4 switches to a clear female stock voice, quicker articulation, a more audible but modest pitch lift, reduced lower-mid weight and gentle presence/air EQ. Remove the stretched GO entirely. Keep GO under 360 ms and all numbers under 430 ms without cutting spoken phonemes. The available Edge synthesis supports rate and pitch, not emotion-style tags, so do not claim a model-generated `excited` style or bypass that service restriction.

Save the rejected pack for A/B listening, regenerate the four local WAV assets, validate onset/duration/headroom and increase cache revision. Keep voice through the effects bus and verify mute, pause, repeat and stale network events with current regression tests. The music-room audition and exported sequence must use the new pack. Do not treat waveform metrics as evidence that the voice sounds youthful; that remains a listening judgment.

Reference scope: KartRider Rush+ official site/community video entry and the starting-boost tutorial establish the countdown/start presentation context. Timing/prosody choices here are original design decisions; they are not measurements or transcriptions of a KartRider actor's recording.
