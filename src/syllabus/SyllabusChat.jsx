import { useState, useEffect } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../../firebase"; // Import Firestore
import python from "./python.json";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function ChatBotP() {
  const [currentSubjectIndex, setCurrentSubjectIndex] = useState(0);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState({});
  const [isFinalSlide, setIsFinalSlide] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [response, setResponse] = useState(null);

  const API_KEY = "AIzaSyBBp8jEQ3zEJXLkSVgBpGHKr6q-EycIDSI"; // Replace this with your actual API key
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const currentSubject = python.subjects[currentSubjectIndex];
  const currentChapter = currentSubject.chapters[currentChapterIndex];

  useEffect(() => {
    if (currentChapter) {
      const message = ` Chapter: ${currentChapter.chapter}. Please select the topics you've covered.`;
      speakOutLoud(message); // Make the bot speak the current chapter and instruction
    } else {
      const message = `Please select the topics you have covered in ${currentSubject.subject}.`;
      speakOutLoud(message); // Make the bot speak the question about covered topics
    }
  }, [currentChapter, currentSubject.subject]);

  const addMessage = (message) => {
    console.log(message.text);
    // Optionally, you can add messages to a state if you're displaying them in the UI
  };

  // Function to speak out text
  const speakOutLoud = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const handleTopicChange = (topic) => {
    const key = `${currentSubject.subject}_${currentChapter.chapter}`;
    const newSelectedTopics = {
      ...selectedTopics,
      [key]: {
        ...(selectedTopics[key] || {}),
        [topic]: !(selectedTopics[key]?.[topic] || false),
      },
    };
    setSelectedTopics(newSelectedTopics);
  };

  const handleNext = () => {
    const totalChapters = currentSubject.chapters.length;
    const totalSubjects = python.subjects.length;

    if (currentChapterIndex < totalChapters - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
    } else if (currentSubjectIndex < totalSubjects - 1) {
      setCurrentSubjectIndex(currentSubjectIndex + 1);
      setCurrentChapterIndex(0);
    } else {
      setIsFinalSlide(true);
    }
  };

  const handleDone = async () => {
    const result = python.subjects.map((subject) => ({
      subject: subject.subject,
      chapters: subject.chapters.map((chapter) => ({
        chapter: chapter.chapter,
        topics: chapter.topics.map((topic) => ({
          topic: topic,
          covered:
            selectedTopics[`${subject.subject}_${chapter.chapter}`]?.[topic] ||
            false,
        })),
      })),
    }));
  
    const jsonString = JSON.stringify(result, null, 2);
    addMessage({
      role: "bot",
      text: "You have completed the syllabus.",
    });
    speakOutLoud("You have completed the syllabus.");
  
    const refinedPrompt = `
  Based on the following JSON, create a study plan and routine that prioritizes the topics which have not been covered. For each subject, provide a weekly schedule suggesting how many topics should be completed per week until all are finished. Please also include a summary of the total covered topics vs. uncovered topics for each subject. 
  
  Here is the JSON data representing the current syllabus progress: 
  
  ${jsonString}
  
  The output should be in a readable JSON format with two main sections: 
  1. "summary": An overview of progress for each subject, showing how many topics have been covered vs. how many remain.
  2. "routine": A weekly study plan for completing the remaining topics in each subject.
  
  The "routine" section should include a title and a start/end time like this example:
  
  {
    "title": "Math Exam",
    "start": "2024-09-04T15:00:00",
    "end": "2024-09-04T17:20:00"
  }
  `;
  
    try {
      const result = await model.generateContent(refinedPrompt);
      const responseText = await result.response.text(); // Get the response text
  
      if (responseText) {
        const jsonStart = responseText.indexOf("{"); // Find the start of the JSON block
        const jsonEnd = responseText.lastIndexOf("}"); // Find the end of the JSON block
  
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
  
          try {
            const jsonResponse = JSON.parse(jsonString);
  
            // Assuming the response contains a "routine" key with an array of events
            if (jsonResponse.routine && Array.isArray(jsonResponse.routine)) {
              const routineArray = jsonResponse.routine.map((entry, index) => {
                const baseDate = new Date(); // Use current date as base
                baseDate.setDate(baseDate.getDate() + index); // Increment day for each event
                
                const formattedDate = baseDate.toISOString().split("T")[0];
  
                return {
                  id: `event${index + 1}`, // Generate unique ID for each event
                  title: entry.title,
                  start: `${formattedDate}T${entry.start?.split("T")[1] || '00:00:00'}`, // Use the same start time with new date
                  end: `${formattedDate}T${entry.end?.split("T")[1] || '00:00:00'}`,     // Use the same end time with new date
                };
              });
  
              console.log("Final routine array:", routineArray);
  
              // Store routineArray in Firebase Firestore
              await addDoc(collection(db, "calendarData"), {
                studentId: "student123", // Replace with actual student ID
                routineArray: routineArray,
              });
  
              console.log("Routine array saved to Firestore!");
  
            } else {
              throw new Error("Routine array is missing or not in expected format.");
            }
          } catch (jsonError) {
            console.error("Error parsing JSON response:", jsonError);
            setResponse("Error parsing response JSON");
          }
  
        } else {
          throw new Error("JSON block not found in the response.");
        }
      } else {
        throw new Error("Empty response from the AI model.");
      }
    } catch (error) {
      console.error("Error generating AI response or saving to Firebase:", error);
      setResponse("Error generating response");
    }
  };
  

  return (
    <div className="flex flex-col h-[70vh] bg-gray-100">
      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 h-fit text-black flex items-center justify-center z-50">
          <div className="w-full max-w-lg bg-white shadow-lg rounded-t-lg p-4">
            <h2 className="text-2xl font-bold mb-4">
              {currentSubject.subject}
            </h2>
            <h3 className="text-xl font-semibold mb-2">
              Chapter: {currentChapter.chapter}
            </h3>

            <div className="w-full bg-blue-100 rounded-lg p-3">
              <h4 className="text-lg font-semibold">Select topics:</h4>
              <form className="mt-2">
                {currentChapter.topics.map((topic, index) => (
                  <label key={index} className="block mb-2">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={
                        selectedTopics[
                          `${currentSubject.subject}_${currentChapter.chapter}`
                        ]?.[topic] || false
                      }
                      onChange={() => handleTopicChange(topic)}
                    />
                    {topic}
                  </label>
                ))}
              </form>
            </div>

            {/* Buttons */}
            <div className="mt-4 flex justify-between">
              {!isFinalSlide ? (
                <button
                  onClick={handleNext}
                  className="bg-blue-500 bg-purple text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                  Next
                </button>
              ) : (
                <>
                  <button
                    onClick={handleDone}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-600"
                  >
                    Done
                  </button>
                  <button
                    className="btn"
                    onClick={() => document.getElementById("quiz").showModal()}
                  >
                    Take A Quiz
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
