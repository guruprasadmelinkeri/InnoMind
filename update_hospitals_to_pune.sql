-- Update hospitals table to have realistic Pune, Maharashtra, India coordinates
-- Pune approximate coordinates: Latitude 18.5204° N, Longitude 73.8410° E
-- Pune metropolitan area bounds: Lat 18.4-18.7, Lng 73.7-74.0

-- First, let's see what we're working with
SELECT id, name, latitude, longitude FROM hospitals LIMIT 5;

-- Update hospitals with realistic Pune data
-- We'll update the existing 15 hospitals with Pune-appropriate names and coordinates

-- Update hospital names to real Pune hospitals
UPDATE hospitals SET name = 'Ruby Hall Clinic' WHERE id = 1;
UPDATE hospitals SET name = 'Jehangir Hospital' WHERE id = 2;
UPDATE hospitals SET name = 'Sahyadri Hospital' WHERE id = 3;
UPDATE hospitals SET name = 'Deenanath Mangeshkar Hospital' WHERE id = 4;
UPDATE hospitals SET name = 'Aditya Birla Memorial Hospital' WHERE id = 5;
UPDATE hospitals SET name = 'KEM Hospital' WHERE id = 6;
UPDATE hospitals SET name = 'Bharati Hospital' WHERE id = 7;
UPDATE hospitals SET name = 'Momaya Hospital' WHERE id = 8;
UPDATE hospitals SET name = 'Oyster & Pearl Hospital' WHERE id = 9;
UPDATE hospitals SET name = 'Dinath Mangeshkar Hospital & Research Centre' WHERE id = 10;
UPDATE hospitals SET name = 'Lotus Hospital' WHERE id = 11;
UPDATE hospitals SET name = 'Columbia Asia Hospital' WHERE id = 12;
UPDATE hospitals SET name = 'Manipal Hospital' WHERE id = 13;
UPDATE hospitals SET name = 'Seven Hills Hospital' WHERE id = 14;
UPDATE hospitals SET name = 'Lifeline Hospital' WHERE id = 15;

-- Update addresses
UPDATE hospitals SET address = CONCAT(name, ', Pune, Maharashtra, India');

-- Generate realistic coordinates within Pune bounds
-- Using deterministic but varied coordinates for each hospital
UPDATE hospitals SET
    latitude = CASE id
        WHEN 1 THEN 18.5220 WHEN 2 THEN 18.5180 WHEN 3 THEN 18.5250 WHEN 4 THEN 18.5150 WHEN 5 THEN 18.5300
        WHEN 6 THEN 18.5100 WHEN 7 THEN 18.5280 WHEN 8 THEN 18.5050 WHEN 9 THEN 18.5350 WHEN 10 THEN 18.5000
        WHEN 11 THEN 18.5400 WHEN 12 THEN 18.4950 WHEN 13 THEN 18.5450 WHEN 14 THEN 18.4900 WHEN 15 THEN 18.5500
    END,
    longitude = CASE id
        WHEN 1 THEN 73.8450 WHEN 2 THEN 73.8350 WHEN 3 THEN 73.8500 WHEN 4 THEN 73.8300 WHEN 5 THEN 73.8550
        WHEN 6 THEN 73.8250 WHEN 7 THEN 73.8520 WHEN 8 THEN 73.8200 WHEN 9 THEN 73.8580 WHEN 10 THEN 73.8150
        WHEN 11 THEN 73.8620 WHEN 12 THEN 73.8100 WHEN 13 THEN 73.8650 WHEN 14 THEN 73.8050 WHEN 15 THEN 73.8700
    END;

-- Ensure we have proper resource data (ICU beds and ventilators)
-- This assumes hospital_resources table exists with foreign key to hospitals
-- If resources don't exist, they may need to be created separately

-- Verify the changes
SELECT id, name, latitude, longitude FROM hospitals ORDER BY id;

-- Calculate approximate distance from Pune center to verify
SELECT
    id,
    name,
    latitude,
    longitude,
    -- Haversine formula approximation for distance check
    (6371 * acos(cos(radians(18.5204)) * cos(radians(latitude)) * cos(radians(longitude) - radians(73.8410)) + sin(radians(18.5204)) * sin(radians(latitude)))) AS distance_km_from_pune_center
FROM hospitals
ORDER BY distance_km_from_pune_center;