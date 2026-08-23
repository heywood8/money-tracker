# app-startup

## Purpose

What the user sees between process launch and the first interactive frame: the
native splash, the cold-start loading screen that continues it, and the
transition into the app once the first database reads have resolved.

## ADDED Requirements

### Requirement: Cold-start loading screen
The app SHALL show an animated loading screen while the first database reads of a
launch are in flight, and SHALL show it at most once per process.

#### Scenario: First launch with reads pending
- **GIVEN** the process has just started and no data has been read yet
- **WHEN** the language preference, accounts, categories or the first page of operations is still loading
- **THEN** the cold-start loading screen is shown

#### Scenario: Returning from the background
- **GIVEN** the loading screen has already been shown once in this process
- **WHEN** the app returns to the foreground from the background
- **THEN** no loading screen and no animation are shown

#### Scenario: Later reads within the same launch
- **GIVEN** the loading screen has already been shown once in this process
- **WHEN** a screen re-mounts or reloads its data
- **THEN** that screen uses its own loading state and the cold-start screen does not reappear

### Requirement: Continuity with the native splash
The loading screen SHALL be visually indistinguishable from the native splash at
the moment it takes over.

#### Scenario: Handover from the native splash
- **WHEN** the native splash is replaced by the loading screen
- **THEN** the app mark is drawn at the same size and at the same position as on the splash
- **AND** the background colour is the same as the splash background

#### Scenario: Splash configuration
- **WHEN** the native splash is configured
- **THEN** the icon width is pinned to the size the loading screen draws
- **AND** the splash background is the brand dark colour, the same value in every theme

### Requirement: Motion sequence
The loading screen SHALL play a single sequence of at most 560 ms: a hold, one
rotation of the app mark, three coins falling into a stack, and a dissolve into
the app.

#### Scenario: Full sequence on a slow-enough read
- **GIVEN** the first reads take longer than 560 ms
- **WHEN** the loading screen plays
- **THEN** the mark holds still for 60 ms, then rotates once over 300 ms
- **AND** three coins each fall for 150 ms, starting 70 ms apart, landing in a stack

#### Scenario: Coins never overlap the mark
- **WHEN** a coin appears and falls
- **THEN** it appears below the lower edge of the mark and falls into the stack
- **AND** the mark and the stack do not overlap in any frame of the sequence

#### Scenario: Dissolve into the app
- **WHEN** the sequence ends
- **THEN** the loading screen cross-fades into the app over 120 ms
- **AND** the cross-fade takes 200 ms when the app is in the light theme, because the surfaces differ more
- **AND** it takes the longer 200 ms while the stored theme preference has not been read yet, since the device's own scheme is not yet proof of the app's

### Requirement: The animation never blocks on the JS thread
The sequence SHALL run on the UI thread so that database work on the JS thread
cannot stall it.

#### Scenario: Heavy reads during the animation
- **GIVEN** the first database reads are saturating the JS thread
- **WHEN** the sequence is playing
- **THEN** it continues at full frame rate
- **AND** its timing — the hold, the stagger between coins, the slow-path threshold — holds too, because none of it waits on the JS thread

### Requirement: No animation for fast reads
The app SHALL NOT start the sequence when the data is ready before it would
become visible.

#### Scenario: Reads resolve inside the hold
- **GIVEN** the loading screen is showing its first, motionless frame
- **WHEN** all first reads resolve within the 60 ms hold
- **THEN** no rotation and no coin ever appears
- **AND** the screen cross-fades straight into the app, with none of the sequence's motion

### Requirement: Graceful truncation
When the data arrives mid-sequence the app SHALL shorten the sequence rather than
cut it off.

#### Scenario: Data arrives while coins are falling
- **GIVEN** the sequence is playing
- **WHEN** all first reads resolve
- **THEN** coins that have not yet appeared never appear
- **AND** coins already falling land in the stack
- **AND** the stack is shorter but never a coin frozen in mid-air

#### Scenario: Data arrives mid-rotation
- **GIVEN** the mark is part-way through its rotation
- **WHEN** all first reads resolve
- **THEN** the mark completes the current half-turn, taking at least 150 ms, before the dissolve starts

### Requirement: Slow path
The app SHALL tell the user something is still happening when the wait is long
enough to read as a hang.

#### Scenario: Reads still pending after 1600 ms
- **GIVEN** the sequence has finished and the data has not arrived
- **WHEN** 1600 ms have passed since the loading screen appeared
- **THEN** a translated caption fades in below the stack over 200 ms
- **AND** no caption is shown before that threshold

#### Scenario: A long wait with animations turned off
- **GIVEN** the device has animations turned off in accessibility settings
- **WHEN** 1600 ms have passed since the loading screen appeared with the data still pending
- **THEN** the caption appears as it would otherwise — the wait is no shorter

### Requirement: Reduced motion
The app SHALL respect the operating system's reduced-motion setting.

#### Scenario: Reduce motion is enabled
- **GIVEN** the device has animations turned off in accessibility settings
- **WHEN** the loading screen is shown
- **THEN** the mark and the full stack are drawn static, with no rotation and no falling
- **AND** only the dissolve into the app is animated
