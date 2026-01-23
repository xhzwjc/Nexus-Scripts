
import os
from typing import List, Dict, Any, Optional
import logging
from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

from app.services.system_context import SYSTEM_CONTEXT

class AiService:
    def __init__(self):
        self.base_url = settings.AI_BASE_URL
        self.api_key = settings.AI_API_KEY
        self.model_name = settings.AI_MODEL_NAME
        
        try:
            self.client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key
            )
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
            self.client = None

    def generate_response_stream(self, message: str, history: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None, image_data: Optional[str] = None):
        """Generates a streaming response from the AI. Supports optional image for vision analysis."""
        if not self.client:
            yield "Error: AI service is not initialized."
            return

        # Construct System Prompt
        system_prompt = self._build_system_prompt(context, has_image=bool(image_data))
        
        # Prepare Messages
        messages = [{"role": "system", "content": system_prompt}]
        
        # Convert history format
        for turn in history:
            role = turn.get('role', 'user')
            if role == 'model':
                role = 'assistant'
                
            parts = turn.get('parts', '')
            content = parts[0] if isinstance(parts, list) and len(parts) > 0 else str(parts)
            messages.append({"role": role, "content": content})
        
        # Add current message (with optional image for vision)
        if image_data:
            # Multi-modal message for vision
            user_content = [
                {"type": "text", "text": message},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
            ]
            messages.append({"role": "user", "content": user_content})
            logger.info(f"======== AI Chat Input (with Image) ========\n{message}\n[Image attached: {len(image_data)} bytes]\n===============================")
        else:
            messages.append({"role": "user", "content": message})
            logger.info(f"======== AI Chat Input ========\n{message}\n===============================")

        try:
            stream = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                stream=True
            )
            
            full_response = ""
            for chunk in stream:
                if not chunk.choices:
                    continue
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    # Print to console for immediate visibility (no newline to simulate streaming)
                    print(content, end="", flush=True)
                    yield content
            
            # Print newline after tracking
            print("\n")
            logger.info(f"\n======== AI Chat Output (Full) ========\n{full_response}\n=======================================")

        except Exception as e:
            error_msg = f"AI Generation Error: {str(e)}"
            logger.error(error_msg)
            yield error_msg

    def _build_system_prompt(self, context: Optional[Dict[str, Any]], has_image: bool = False) -> str:
        prompt = """You are a helpful assistant for the Enterprise Tool System. 
Your goal is to help users understand available tools and how to use them.

**Knowledge Base:**
"""
        # Inject Comprehensive System Context
        prompt += f"\n{SYSTEM_CONTEXT}\n"

        # Inject Logic Context (Tools list)
        if context and 'tools' in context:
            prompt += "\n--- AVAILABLE TOOLS (Dynamic) ---\n"
            try:
                import json
                # Try to serialize cleanly
                prompt += json.dumps(context['tools'], ensure_ascii=False, indent=2)
            except:
                prompt += str(context['tools'])
        
        prompt += """
\n**Instructions:**
1. Answer questions based ONLY on the provided Knowledge Base and Tools list.
2. If asked about a tool not in the list, say you don't know about it.
3. Be concise and helpful.
4. If asked "how to use" a tool, check the description and any specific docs provided.
"""
        
        # Add vision-specific instructions if image is provided
        if has_image:
            prompt += """
**Screenshot Analysis Instructions:**
When an image/screenshot is provided:
1. Analyze the interface shown in the image.
2. Identify which tool or page the user is currently viewing.
3. Describe what the user appears to be doing in 40 characters or less (简洁描述).
4. If the user asks a question about the screenshot, answer based on what you see.
"""
        return prompt
