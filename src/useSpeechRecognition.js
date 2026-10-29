import { useEffect, useRef, useState } from 'react'

function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')

  const recognitionRef = useRef(null)
  const isStartingRef = useRef(false)

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        'Speech recognition is not supported in this browser.'
      )
      return
    }

    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      isStartingRef.current = false
      setIsListening(true)
      setError('')
    }

    recognition.onresult = (event) => {
      let finalText = ''

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index]

        if (result.isFinal) {
          finalText += result[0].transcript
        }
      }

      if (finalText.trim()) {
        setTranscript((currentText) => {
          const newText = finalText.trim()

          if (!currentText) {
            return newText
          }

          return `${currentText} ${newText}`
        })
      }
    }

    recognition.onerror = (event) => {
      isStartingRef.current = false
      setIsListening(false)

      if (event.error === 'not-allowed') {
        setError(
          'Microphone permission was denied.'
        )
        return
      }

      if (event.error === 'no-speech') {
        setError(
          'No speech was detected. Please try again.'
        )
        return
      }

      setError(
        `Speech recognition error: ${event.error}`
      )
    }

    recognition.onend = () => {
      isStartingRef.current = false
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.stop()
      recognitionRef.current = null
    }
  }, [])

  const startListening = () => {
    if (!recognitionRef.current) {
      return
    }

    if (
      isListening ||
      isStartingRef.current
    ) {
      return
    }

    setTranscript('')
    setError('')

    isStartingRef.current = true

    try {
      recognitionRef.current.start()
    } catch {
      isStartingRef.current = false
      setIsListening(false)
      setError('Could not start the microphone.')
    }
  }

  const stopListening = () => {
    if (!recognitionRef.current) {
      return
    }

    if (!isListening) {
      return
    }

    recognitionRef.current.stop()
  }

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  }
}

export default useSpeechRecognition
