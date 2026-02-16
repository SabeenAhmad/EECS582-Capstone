/**
 * ChatBot Component
 * 
 * Description: A React Native chatbot interface that provides parking assistance
 * for KU campus. Integrates with OpenAI API to answer parking-related questions
 * using real-time and historical parking data.
 * 
 * Programmer: Tanusakaray
 * Date Created: February 13, 2026
 * Date Revised: February 15, 2026
 * Revision Description: Initial implementation with OpenAI integration
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from './context/ThemeContext';
import lots from '../src/data/mockParking';   

// OpenAI API key configuration - replace with actual key from https://platform.openai.com/api-keys
const OPENAI_API_KEY = 'your-openai-api-key-here';

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
  const scrollViewRef = useRef(); // Reference for auto-scrolling chat
  const router = useRouter(); // Expo router for navigation
  const { theme, colors } = useTheme(); // Theme context for styling

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

  /**
   * Generates parking context data for AI prompt
   * Returns current availability and historical patterns
   */
  const generateParkingContext = () => {
    // Current real-time availability data
    const currentData = lots.map(lot => {
      const latest = lot.dataPoints[lot.dataPoints.length - 1];
      const available = lot.total - latest.occupied;
      return `${lot.name}: ${available}/${lot.total} spots available (${lot.permit} permit required)`;
    }).join('\n');
    
    // Historical patterns for time-based estimates
    const historicalPatterns = lots.map(lot => {
      const patterns = lot.dataPoints.map(dp => `${dp.time}: ${lot.total - dp.occupied} available`).join(', ');
      return `${lot.name} historical pattern: ${patterns}`;
    }).join('\n');
    
    return { currentData, historicalPatterns };
  };

  /**
   * Handles sending user messages and getting AI responses
   * Includes fallback logic for API failures
   */
  const sendMessage = async () => {
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

      // Make API request to OpenAI
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'user',
            content: prompt
          }],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      // Handle API errors
      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', response.status, errorData);
        throw new Error(`OpenAI API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      // Process successful API response
      const data = await response.json();
      
      if (data.choices && data.choices[0]) {
        const botResponse = {
          id: Date.now() + 1,
          text: data.choices[0].message.content,
          isBot: true,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, botResponse]);
      } else {
        throw new Error('Invalid response from OpenAI');
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
        const allen = lots.find(lot => lot.name.includes('Allen'));
        if (allen) {
          const latest = allen.dataPoints[allen.dataPoints.length - 1];
          const available = allen.total - latest.occupied;
          fallbackText += `Allen Fieldhouse Lot: ${available}/${allen.total} spots available (${allen.permit} permit required)`;
        }
      } else if (lowerInput.includes('mississippi') || lowerInput.includes('garage')) {
        const garage = lots.find(lot => lot.name.includes('Mississippi'));
        if (garage) {
          const latest = garage.dataPoints[garage.dataPoints.length - 1];
          const available = garage.total - latest.occupied;
          fallbackText += `Mississippi Street Garage: ${available}/${garage.total} spots available (${garage.permit} permit required)`;
        }
      } else if (lowerInput.includes('most') || lowerInput.includes('best') || lowerInput.includes('available')) {
        // Show lots with most availability
        const lotAvailability = lots.map(lot => {
          const latest = lot.dataPoints[lot.dataPoints.length - 1];
          const available = lot.total - latest.occupied;
          return { name: lot.name, available, total: lot.total, permit: lot.permit };
        }).sort((a, b) => b.available - a.available);
        
        fallbackText += `Lots with most availability:\n${lotAvailability.slice(0, 3).map(lot => 
          `• ${lot.name}: ${lot.available}/${lot.total} spots (${lot.permit} permit)`
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

      {/* Input area with text field and send button */}
      <View style={[styles.inputContainer, { backgroundColor: colors.background }]}>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: colors.modalBackground,
              color: colors.modalText,
              borderColor: colors.inputBorder,
            },
          ]}
          placeholder="Ask about parking availability..." // Hint text for users
          placeholderTextColor={theme === 'dark' ? '#aaaaaa' : '#777777'}
          value={inputText}
          onChangeText={setInputText} // Update input state on text change
          multiline // Allow multiple lines of text
          maxLength={500} // Limit input length
        />
        <TouchableOpacity
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
});