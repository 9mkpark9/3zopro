import time

def initialize_time_variables():
    # Record start time for total recording duration
    start_time = time.time()
    # Variables for sleep time measurement
    total_sleep_time = 0.0
    sleep_start = None
    # Variables for head-turn time measurement
    total_turn_time = 0.0
    turn_start = None

    return start_time, total_sleep_time, sleep_start, total_turn_time, turn_start

def update_sleep_time(current_state, sleep_start, total_sleep_time, current_time):
    if current_state == "수면":
        if sleep_start is None:
            sleep_start = current_time
    else:
        if sleep_start is not None:
            # Accumulate the sleep time
            total_sleep_time += (current_time - sleep_start)
            sleep_start = None
    return sleep_start, total_sleep_time

def update_turn_time(head_direction, turn_start, total_turn_time, current_time):
    if head_direction in ["왼쪽", "오른쪽"]:
        if turn_start is None:
            turn_start = current_time
    else:
        if turn_start is not None:
            # Accumulate the turn time
            total_turn_time += (current_time - turn_start)
            turn_start = None
    return turn_start, total_turn_time