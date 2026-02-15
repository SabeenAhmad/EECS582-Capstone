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

const OPENAI_API_KEY = 'your-openai-api-key-here';

export default function ChatBot() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm your parking assistant. Ask me about parking availability, lot locations, or any other parking-related questions!",
      isBot: true,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef();
  const router = useRouter();
  const { theme, colors } = useTheme();

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateParkingContext = () => {
    const currentData = lots.map(lot => {
      const latest = lot.dataPoints[lot.dataPoints.length - 1];
      const available = lot.total - latest.occupied;
      return `${lot.name}: ${available}/${lot.total} spots available (${lot.permit} permit required)`;
    }).join('\n');
    
    const historicalPatterns = lots.map(lot => {
      const patterns = lot.dataPoints.map(dp => `${dp.time}: ${lot.total - dp.occupied} available`).join(', ');
      return `${lot.name} historical pattern: ${patterns}`;
    }).join('\n');
    
    return { currentData, historicalPatterns };
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputText,
      isBot: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText('');
    setIsLoading(true);

    try {
      const { currentData, historicalPatterns } = generateParkingContext();
      
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

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API Error:', response.status, errorData);
        throw new Error(`OpenAI API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

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
      console.error('Full error details:', error);
      console.error('Error message:', error.message);
      
      // Log the response if it exists
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      // Smart fallback that can answer basic questions
      let fallbackText = `I'm having trouble connecting to my AI service right now, but I can still help!\n\n`;
      
      // Try to answer basic questions with parking data
      const lowerInput = currentInput.toLowerCase();
      
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
        const lotAvailability = lots.map(lot => {
          const latest = lot.dataPoints[lot.dataPoints.length - 1];
          const available = lot.total - latest.occupied;
          return { name: lot.name, available, total: lot.total, permit: lot.permit };
        }).sort((a, b) => b.available - a.available);
        
        fallbackText += `Lots with most availability:\n${lotAvailability.slice(0, 3).map(lot => 
          `• ${lot.name}: ${lot.available}/${lot.total} spots (${lot.permit} permit)`
        ).join('\n')}`;
      } else {
        fallbackText += `Here's the current parking availability:\n\n${generateParkingContext().currentData}`;
      }
      
      fallbackText += `\n\nIs there a specific lot you'd like to know about?`;
      
      const fallbackResponse = {
        id: Date.now() + 1,
        text: fallbackText,
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = (message) => (
    <View
      key={message.id}
      style={[
        styles.messageContainer,
        message.isBot ? styles.botMessage : styles.userMessage,
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          {
            backgroundColor: message.isBot 
              ? colors.modalBackground 
              : colors.buttonBackground,
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.buttonBackground }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={24} color={colors.buttonText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.buttonText }]}>
          Parking Assistant
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.map(renderMessage)}
        {isLoading && (
          <View style={[styles.messageContainer, styles.botMessage]}>
            <View style={[styles.messageBubble, { backgroundColor: colors.modalBackground }]}>
              <Text style={[styles.messageText, { color: colors.modalText }]}>
                Thinking...
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
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
          placeholder="Ask about parking availability..."
          placeholderTextColor={theme === 'dark' ? '#aaaaaa' : '#777777'}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            {
              backgroundColor: inputText.trim() ? colors.buttonBackground : '#ccc',
            },
          ]}
          onPress={sendMessage}
          disabled={!inputText.trim() || isLoading}
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