import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
import numpy as np
from datetime import datetime
import json

# Initialize Firebase Admin with your service account (look in env/ now to avoid committing secrets)
cred = credentials.Certificate('env/parking-capstone-9778c-firebase-adminsdk-fbsvc-c1179e192c.json')
try:
    firebase_admin.initialize_app(cred)
except ValueError:
    # App already initialized
    pass

def get_firestore_data():
    """Fetch parking data from Firestore"""
    db = firestore.client()
    lots = db.collection('lots').stream()
    return [lot.to_dict() for lot in lots]

def analyze_parking_data():
    # Fetch real data from Firestore
    lots_data = get_firestore_data()
    popular_times = {}

    for lot in lots_data:
        lot_name = lot['name']
        capacity = lot['capacity']
        hourly_data = lot.get('historicalData', {}).get('averageByHour', {})
        
        # Convert hourly data to DataFrame
        data_points = [
            {"hour": int(hour), "occupied": count}
            for hour, count in hourly_data.items()
        ]
        df = pd.DataFrame(data_points)
        
        if not df.empty:
            df['occupancy_rate'] = (df['occupied'] / capacity) * 100
            
            # Create 24-hour data (fill missing hours with 0)
            full_hours = pd.Series(index=range(24), data=0.0)
            if not df.empty:
                hourly_avg = df.set_index('hour')['occupancy_rate']
                full_hours.update(hourly_avg)
            
            popular_times[lot_name] = {
                'data': full_hours.tolist(),
                'max_occupancy': full_hours.max(),
                'permit': lot['permit'],
                'current_occupancy': lot['count_now'],
                'capacity': capacity
            }
    
    # Save the analyzed data
    with open('src/data/popularTimes.json', 'w') as f:
        json.dump(popular_times, f, indent=2)
    print("Analysis complete! Results saved to popularTimes.json")
    return popular_times

if __name__ == '__main__':
    results = analyze_parking_data()
    print("\nAnalysis Summary:")
    for lot_name, data in results.items():
        print(f"\n{lot_name} ({data['permit']} Permit)")
        print(f"Current Occupancy: {data['current_occupancy']}/{data['capacity']} spaces")
        print(f"Max Occupancy Rate: {data['max_occupancy']:.1f}%")