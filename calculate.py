
def cal_headturn(front_view_time, total_class_time):
    # Calculate the ratio
    R = front_view_time / total_class_time

    # Determine points based on the ratio
    if R > 0.9:
        points = 30
    elif 0.5 <= R <= 0.8:
        points = 15 + 14 * (R - 0.5) / 0.4
    else:  # R < 0.5
        points = 14 * R

    return round(points, 2)  # Round to 2 decimal places if needed

def cal_sleeptime(total_sleep_time, elapsed_time):
    if elapsed_time > 0:
        drowsiness = 50 - (50 * (round(total_sleep_time / elapsed_time, 2)))

    else:
        drowsiness = 50

    return round(drowsiness, 2)

def cal_blinks_per_minute(total_blinks, total_time_seconds):
    # Convert time from seconds to minutes
    total_time_minutes = total_time_seconds / 60
    # Calculate blinks per minute
    return total_blinks / total_time_minutes

def cal_blink_points(blinks_per_minute):
    if blinks_per_minute <= 20:
        points = 0
    else:
        points = blinks_per_minute - 20

    return 20 - points

def totalscore(sleep_point, ht_point, blink_points):
    total = int(sleep_point) + int(ht_point) + int(blink_points)
    return total