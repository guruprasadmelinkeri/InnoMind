import math

EARTH_RADIUS_KM = 6371.0
DEFAULT_AVERAGE_SPEED_KMH = 30.0
DEFAULT_MAX_TRAVEL_TIME_MINUTES = 60.0

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees) in kilometers.
    """
    lat1_rad = math.radians(float(lat1))
    lon1_rad = math.radians(float(lon1))
    lat2_rad = math.radians(float(lat2))
    lon2_rad = math.radians(float(lon2))

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    distance = EARTH_RADIUS_KM * c
    return round(distance, 2)

def calculate_travel_time(distance_km: float, speed_kmh: float = DEFAULT_AVERAGE_SPEED_KMH) -> float:
    """
    Calculate estimated travel time in minutes based on distance and average speed.
    """
    if distance_km <= 0 or speed_kmh <= 0:
        return 0.0
    time_hours = distance_km / speed_kmh
    time_minutes = time_hours * 60.0
    return round(time_minutes, 2)

def calculate_travel_score(
    travel_time_minutes: float,
    max_time_minutes: float = DEFAULT_MAX_TRAVEL_TIME_MINUTES
) -> float:
    """
    Convert travel time in minutes into a score from 0 to 100.
    Shorter travel time yields a higher score.
    """
    if travel_time_minutes <= 0:
        return 100.0
    if travel_time_minutes >= max_time_minutes:
        return 0.0
    
    score = 100.0 * (1.0 - (travel_time_minutes / max_time_minutes))
    return round(max(0.0, min(100.0, score)), 2)
