/**
 * ChatBot Component
 * 
 * Description: A React Native chatbot interface that provides parking assistance
 * for KU campus. Integrates with OpenAI API to answer parking-related questions
 * using real-time and historical parking data.
 * 
 * Programmer: Tanusakaray
 * Date Created: February 13, 2026
 * Date Revised: February 23, 2026
 * Revision Description: AI prompt suggestions and enter key functionality
 * 
 * Preconditions:
 * - OpenAI API key must be configured
 * - Parking data must be imported from mockParking
 * - Expo router must be configured
 * 
 * Acceptable Input:
 * - Text messages up to 500 characters
 * - Questions about parking availability, lot locations, estimates
 * 
 * Postconditions:
 * - Returns AI-generated responses about parking
 * - Fallback responses if API fails
 * - Updates message hitory state
 * 
 * Return Values:
 * - JSX component rendering the chat interface
 * 
 * Error Conditions:
 * - OpenAI API failures (handled with fallback responses)
 * - Network connectivity issues
 * - Invalid API responses
 * 
 * Side Effects:
 * - Makes HTTP requests to OpenAI API
 * - Updates component state (messages, loading)
 * 
 * Known Faults:
 * - API key must be manually configured (not in environment variables)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from './context/ThemeContext';
import { getLots } from '../src/firebase/parkingReads';

// No API key needed in frontend - it's stored securely in Firebase Cloud Functions

/**
 * Main ChatBot functional component
 * Renders a chat interface for parking assistance with OpenAI integration
 */
export default function ChatBot() {
  // State management for chat messages, input, and loading status
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm your parking assistant. Ask me about parking availability, lot locations, or any other parking-related questions!",
      isBot: true,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState(''); // Current user input
  const [isLoading, setIsLoading] = useState(false); // API request loading state
  const [lots, setLots] = useState([]); // Firebase parking lots data
  const scrollViewRef = useRef(); // Reference for auto-scrolling chat
  const inputRef = useRef(); // Reference for text input
  const sendButtonRef = useRef(); // Reference for send button
  const router = useRouter(); // Expo router for navigation
  const { theme, colors } = useTheme(); // Theme context for styling

  // Pre-written suggested prompts for quick user access
  // Users can tap these to insert into input field and edit before sending
  const suggestedPrompts = [
    "Which lot has the most available spots?",
    "Where can I park with a Red permit?",
    "What's the availability at Allen Fieldhouse?",
  ];

  /**
   * Handles inserting a suggested prompt into the input field
   * User can edit the prompt before sending 
   * 
   * @param {string} prompt - The suggested prompt text to insert
   */
  const handleSuggestedPrompt = (prompt) => {
    setInputText(prompt);
    // Focus the input field after inserting prompt (web)
    if (Platform.OS === 'web') {
      setTimeout(() => {
        const inputElement = document.querySelector('input[placeholder="Ask about parking availability..."]');
        if (inputElement) {
          inputElement.focus();
        }
      }, 50);
    } else if (inputRef.current) {
      // Focus on mobile
      inputRef.current.focus();
    }
  };

  /**
   * Scrolls chat view to bottom when new messages are added
   */
  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load parking lots from Firebase on mount
  useEffect(() => {
    const loadLots = async () => {
      try {
        console.log('Chatbot: Loading parking lots from Firebase...');
        const firebaseLots = await getLots();
        console.log('Chatbot: Loaded', firebaseLots.length, 'lots from Firebase:', firebaseLots);
        setLots(firebaseLots);
      } catch (error) {
        console.error('Chatbot: Error loading parking lots from Firebase:', error);
        // Keep lots as empty array if Firebase fails
      }
    };
    loadLots();
  }, []);

  // Add keyboard event listener for web
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleKeyPress = (event) => {
        // If the user presses the "Enter" key on the keyboard
        if (event.key === 'Enter') {
          // Cancel the default action
          event.preventDefault();
          // Trigger the send button with a click
          if (sendButtonRef.current && inputText.trim() && !isLoading) {
            sendMessage();
          }
        }
      };

      // Find the input element and add listener
      const timer = setTimeout(() => {
        const inputElement = document.querySelector('input[placeholder="Ask about parking availability..."]');
        if (inputElement) {
          inputElement.addEventListener('keypress', handleKeyPress);
          // Store reference for cleanup
          inputElement._keyPressHandler = handleKeyPress;
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        const inputElement = document.querySelector('input[placeholder="Ask about parking availability..."]');
        if (inputElement && inputElement._keyPressHandler) {
          inputElement.removeEventListener('keypress', inputElement._keyPressHandler);
        }
      };
    }
  }, [inputText, isLoading]);

  /**
   * Generates parking context data for AI prompt
   * Returns current availability and historical patterns from Firebase
   */
  const generateParkingContext = () => {
    if (lots.length === 0) {
      return {
        currentData: 'Loading parking data...',
        historicalPatterns: 'Loading historical data...',
      };
    }

    // Current real-time availability data from Firebase
    const currentData = lots.map(lot => {
      const available = lot.capacity - lot.count_now;
      const permitInfo = lot.permit ? ` (${lot.permit} permit required)` : '';
      return `${lot.name}: ${available}/${lot.capacity} spots available${permitInfo}`;
    }).join('\n');
    
    // Historical patterns from Firebase averageByHour data
    const historicalPatterns = lots.map(lot => {
      if (!lot.averageByHour || Object.keys(lot.averageByHour).length === 0) {
        return `${lot.name}: No historical data available`;
      }
      
      const patterns = Object.entries(lot.averageByHour)
        .sort(([hourA], [hourB]) => parseInt(hourA) - parseInt(hourB))
        .map(([hour, avgOccupied]) => {
          const avgAvailable = lot.capacity - avgOccupied;
          return `${hour}:00 - ${Math.round(avgAvailable)} available`;
        })
        .join(', ');
      
      return `${lot.name} historical pattern: ${patterns}`;
    }).join('\n');
    
    return { currentData, historicalPatterns };
  };

  /**
   * Handles sending user messages and getting AI responses
   * Includes fallback logic for API failures
   */
  const sendMessage = async () => {
    if (isLoading) return; // Prevent double-send while processing
    if (!inputText.trim()) return; // Prevent empty messages

    // Add user message to chat
    const userMessage = {
      id: Date.now(),
      text: inputText,
      isBot: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText(''); // Clear input field
    setIsLoading(true); // Show loading indicator

    try {
      // Generate context data for AI prompt
      const { currentData, historicalPatterns } = generateParkingContext();
      
      // Create AI prompt with parking data and guidelines
      const prompt = `You are a helpful parking assistant for KU campus. 

CURRENT AVAILABILITY:
${currentData}

HISTORICAL PATTERNS:
${historicalPatterns}

User question: ${currentInput}

GUIDELINES:
- Be concise and direct
- For current availability: just state the numbers
- For estimates: use historical data but keep it brief
- Only mention "based on typical patterns" if asked for future estimates
- Don't over-explain unless specifically asked

Provide a helpful, concise response.`;

      // Make API request to OpenAI via Firebase Cloud Function (keeps API key secure)
      console.log('Sending request to chatbot function...');
      const response = await fetch('https://us-central1-parking-capstone-9778c.cloudfunctions.net/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
        }),
      });

      console.log('Response status:', response.status);

      // Handle API errors
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Chatbot API Error:', response.status, errorData);
        throw new Error(`Chatbot API Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      // Process successful API response
      const data = await response.json();
      
      if (data.ok && data.response) {
        const botResponse = {
          id: Date.now() + 1,
          text: data.response,
          isBot: true,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, botResponse]);
      } else {
        throw new Error('Invalid response from chatbot');
      }
    } catch (error) {
      // Log error details for debugging
      console.error('Full error details:', error);
      console.error('Error message:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      // Fallback response system when AI fails
      let fallbackText = `I'm having trouble connecting to my AI service right now, but I can still help!\n\n`;
      
      // Parse user input for basic parking questions
      const lowerInput = currentInput.toLowerCase();
      
      // Handle specific lot inquiries
      if (lowerInput.includes('allen') || lowerInput.includes('fieldhouse')) {
        const allen = lots.find(lot => lot.name.toLowerCase().includes('allen'));
        if (allen) {
          const available = allen.capacity - allen.count_now;
          const permitInfo = allen.permit ? ` (${allen.permit} permit required)` : '';
          fallbackText += `${allen.name}: ${available}/${allen.capacity} spots available${permitInfo}`;
        }
      } else if (lowerInput.includes('mississippi') || lowerInput.includes('garage')) {
        const garage = lots.find(lot => lot.name.toLowerCase().includes('mississippi') || lot.name.toLowerCase().includes('garage'));
        if (garage) {
          const available = garage.capacity - garage.count_now;
          const permitInfo = garage.permit ? ` (${garage.permit} permit required)` : '';
          fallbackText += `${garage.name}: ${available}/${garage.capacity} spots available${permitInfo}`;
        }
      } else if (lowerInput.includes('most') || lowerInput.includes('best') || lowerInput.includes('available')) {
        // Show lots with most availability
        const lotAvailability = lots.map(lot => {
          const available = lot.capacity - lot.count_now;
          return { name: lot.name, available, capacity: lot.capacity, permit: lot.permit || 'N/A' };
        }).sort((a, b) => b.available - a.available);
        
        fallbackText += `Lots with most availability:\n${lotAvailability.slice(0, 3).map(lot => 
          `• ${lot.name}: ${lot.available}/${lot.capacity} spots (${lot.permit} permit)`
        ).join('\n')}`;
      } else {
        // Default: show all current availability
        fallbackText += `Here's the current parking availability:\n\n${generateParkingContext().currentData}`;
      }
      
      fallbackText += `\n\nIs there a specific lot you'd like to know about?`;
      
      // Add fallback response to chat
      const fallbackResponse = {
        id: Date.now() + 1,
        text: fallbackText,
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackResponse]);
    } finally {
      setIsLoading(false); // Hide loading indicator
    }
  };

  /**
   * Renders individual chat message bubbles
   * Handles styling for bot vs user messages
   */
  const renderMessage = (message) => (
    <View
      key={message.id}
      style={[
        styles.messageContainer,
        message.isBot ? styles.botMessage : styles.userMessage, // Align left for bot, right for user
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          {
            backgroundColor: message.isBot 
              ? colors.modalBackground 
              : colors.buttonBackground, // Different colors for bot vs user
          },
        ]}
      >
        <Text
          style={[
            styles.messageText,
            {
              color: message.isBot ? colors.modalText : colors.buttonText,
            },
          ]}
        >
          {message.text}
        </Text>
        <Text
          style={[
            styles.timestamp,
            {
              color: message.isBot ? colors.modalText : colors.buttonText,
              opacity: 0.6,
            },
          ]}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );

  // Main component render - chat interface layout
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with back button and title */}
      <View style={[styles.header, { backgroundColor: colors.buttonBackground }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()} // Navigate back to previous screen
        >
          <Feather name="arrow-left" size={24} color={colors.buttonText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.buttonText }]}>
          Parking Assistant
        </Text>
        <View style={styles.placeholder} /> {/* Spacer for center alignment */}
      </View>

      {/* Scrollable messages container */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map(renderMessage)} {/* Render all chat messages */}
        {isLoading && ( // Show loading indicator when API request is in progress
          <View style={[styles.messageContainer, styles.botMessage]}>
            <View style={[styles.messageBubble, { backgroundColor: colors.modalBackground }]}>
              <Text style={[styles.messageText, { color: colors.modalText }]}>
                Thinking...
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Suggested prompts section */}
      {/* Displays pre-written prompts that users can tap to insert into input field */}
      <View style={[styles.suggestedPromptsContainer, { backgroundColor: colors.background }]}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestedPromptsContent}
        >
          {suggestedPrompts.map((prompt, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.suggestedPromptButton,
                {
                  backgroundColor: colors.modalBackground,
                  borderColor: colors.inputBorder,
                },
              ]}
              onPress={() => handleSuggestedPrompt(prompt)}
              accessible={false}
              tabIndex={-1}
            >
              <Text style={[styles.suggestedPromptText, { color: colors.modalText }]}>
                {prompt}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Input area with text field and send button */}
      <View style={[styles.inputContainer, { backgroundColor: colors.background }]}>
        <TextInput
          ref={inputRef}
          style={[
            styles.textInput,
            {
              backgroundColor: colors.modalBackground,
              color: colors.modalText,
              borderColor: colors.inputBorder,
            },
          ]}
          placeholder="Ask about parking availability..."
          placeholderTextColor={theme === 'dark' ? '#aaaaaa' : '#777777'}
          value={inputText}
          onChangeText={setInputText}
          
          // mobile (iOS/Android): "Send" key triggers this
          onSubmitEditing={() => {
            if (!isLoading && inputText.trim()) sendMessage();
          }}
          
          returnKeyType="send"
          blurOnSubmit={false}
          multiline={false}
          maxLength={500}
          autoFocus={false}
        />
        <TouchableOpacity
          ref={sendButtonRef}
          style={[
            styles.sendButton,
            {
              backgroundColor: inputText.trim() ? colors.buttonBackground : '#ccc', // Disabled styling when empty
            },
          ]}
          onPress={sendMessage} // Send message when pressed
          disabled={!inputText.trim() || isLoading} // Disable when empty or loading
        >
          <Feather
            name="send"
            size={20}
            color={inputText.trim() ? colors.buttonText : '#999'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * StyleSheet for component styling
 * Defines layout, colors, and dimensions for all UI elements
 */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  placeholder: {
    width: 34,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 20,
  },
  messageContainer: {
    marginBottom: 15,
  },
  botMessage: {
    alignItems: 'flex-start',
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 12,
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Suggested prompts styles
  suggestedPromptsContainer: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  suggestedPromptsContent: {
    paddingHorizontal: 10,
  },
  suggestedPromptButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 10,
  },
  suggestedPromptText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
