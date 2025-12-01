// src/data/parkingEvents.ts
/**
 * parkingEvents.ts
 * -----------------
 * This file defines the structure and mock dataset for all parking-related events
 * displayed in the app’s event banner and calendar views.
 * Each event describes how campus activities impact parking availability.
 *
 * FIELD DESCRIPTIONS:
 * - id: Unique identifier for the event.
 * - title: Human-readable name of the event.
 * - type: Category of event (Football, Basketball, or Campus Event).
 * - date: The event date in YYYY-MM-DD format.
 * - time: When the event occurs (single time or time range).
 * - venue: Primary location of the event.
 * - lotsAffected: List of parking lots expected to experience increased usage.
 * - impactLevel: Severity of expected parking impact (Low, Medium, High).
 * - notes: Optional details or warnings specific to the event.
 */

export type ParkingEventType = 'Football' | 'Basketball' | 'Campus Event';

export type ImpactLevel = 'Low' | 'Medium' | 'High';

export interface ParkingEvent {
  id: string;
  title: string;
  type: ParkingEventType;
  date: string;        
  time: string;      
  venue: string;      
  lotsAffected: string[];
  impactLevel: ImpactLevel;
  notes?: string;
}

// Mock data 
export const parkingEvents: ParkingEvent[] = [
  {
    id: 'campus-2025-11-24',
    title: 'KU Research Symposium',
    type: 'Campus Event',
    date: '2025-11-24',
    time: '10:00 AM – 9:00 PM',
    venue: 'Kansas Union Ballroom',
    lotsAffected: ['Mississippi Street Garage', 'Allen Fieldhouse Lot'],
    impactLevel: 'Medium',
    notes: 'Expect heavier foot traffic around the Union; parking may fill up before noon.',
  },
  {
    id: 'fb-2025-09-06',
    title: 'KU vs Kansas State (Football)',
    type: 'Football',
    date: '2025-09-06',
    time: '6:30 PM',
    venue: 'David Booth Kansas Memorial Stadium',
    lotsAffected: ['Allen Fieldhouse Lot', 'Mississippi Street Garage', 'Lot 72'],
    impactLevel: 'High',
    notes: 'Expect heavy traffic 2 hours before kickoff and 1 hour after the game.',
  },
  {
    id: 'bb-2025-11-15',
    title: 'KU vs Baylor (Men’s Basketball)',
    type: 'Basketball',
    date: '2025-11-15',
    time: '7:00 PM',
    venue: 'Allen Fieldhouse',
    lotsAffected: ['Allen Fieldhouse Lot', 'Mississippi Street Garage'],
    impactLevel: 'High',
    notes: 'Fieldhouse lots may be full by 5:30 PM.',
  },
  {
    id: 'bb-2025-11-22',
    title: 'KU vs Iowa State (Women’s Basketball)',
    type: 'Basketball',
    date: '2025-11-22',
    time: '1:00 PM',
    venue: 'Allen Fieldhouse',
    lotsAffected: ['Allen Fieldhouse Lot'],
    impactLevel: 'Medium',
    notes: 'Good alternative: Lot 90 with a short walk.',
  },
  {
    id: 'campus-2025-10-01',
    title: 'Engineering Career Fair',
    type: 'Campus Event',
    date: '2025-10-01',
    time: '9:00 AM – 4:00 PM',
    venue: 'Kansas Union / Engineering Complex',
    lotsAffected: ['Allen Fieldhouse Lot', 'Allen Fieldhouse Garage'],
    impactLevel: 'Medium',
    notes: 'Morning peak between 8:30–10:00 AM.',
  },
  {
    id: 'campus-2025-08-24',
    title: 'Move-In Weekend',
    type: 'Campus Event',
    date: '2025-08-24',
    time: 'All Day',
    venue: 'Residence Halls',
    lotsAffected: ['Ellsworth Lot', 'Lewis Lot', 'GSP/Corbin Area'],
    impactLevel: 'High',
    notes: 'Expect congestion near residence halls all day.',
  },
];
