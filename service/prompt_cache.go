package service

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

const anthropicEphemeralCacheControl = `{"type":"ephemeral"}`

// BuildPromptCacheKey creates a stable, non-secret cache key from the stable prefix
// of a request. It deliberately ignores the latest user tail so consecutive long
// writing/coding turns can hit upstream prompt cache when the client keeps the
// prefix unchanged.
func BuildPromptCacheKey(model string, messages []dto.Message, tools []dto.ToolCallRequest) string {
	var parts []string
	parts = append(parts, "model="+model)

	for _, message := range messages {
		if message.Role == "system" || message.Role == "developer" {
			parts = append(parts, message.Role+":"+message.StringContent())
		}
	}

	if len(tools) > 0 {
		toolBytes, _ := json.Marshal(tools)
		parts = append(parts, "tools:"+string(toolBytes))
	}

	if len(parts) == 1 {
		// Fallback: use the first non-empty message as a weak but stable-enough prefix.
		for _, message := range messages {
			content := message.StringContent()
			if strings.TrimSpace(content) == "" {
				continue
			}
			if len(content) > 2048 {
				content = content[:2048]
			}
			parts = append(parts, message.Role+":"+content)
			break
		}
	}

	raw := strings.Join(parts, "\n---\n")
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	hash := common.Sha1([]byte(raw))
	if len(hash) > 24 {
		hash = hash[:24]
	}
	return fmt.Sprintf("newapi:%s", hash)
}

func ApplyPromptCacheAutoKey(request *dto.GeneralOpenAIRequest) {
	if request == nil || !common.PromptCacheAutoKeyEnabled || request.PromptCacheKey != "" {
		return
	}
	request.PromptCacheKey = BuildPromptCacheKey(request.Model, request.Messages, request.Tools)
}

func cacheControlRawMessage() json.RawMessage {
	ttl := strings.TrimSpace(common.ClaudeAutoCacheControlTTL)
	if ttl == "" || ttl == "5m" {
		return json.RawMessage(anthropicEphemeralCacheControl)
	}
	if ttl == "1h" {
		return json.RawMessage(`{"type":"ephemeral","ttl":"1h"}`)
	}
	return json.RawMessage(anthropicEphemeralCacheControl)
}

func textLen(s *string) int {
	if s == nil {
		return 0
	}
	return len(*s)
}

func applyMediaCacheControl(blocks []dto.ClaudeMediaMessage) []dto.ClaudeMediaMessage {
	if len(blocks) == 0 {
		return blocks
	}
	for i := range blocks {
		if blocks[i].CacheControl != nil || blocks[i].Type != "text" {
			continue
		}
		if textLen(blocks[i].Text) >= common.ClaudeAutoCacheMinChars {
			blocks[i].CacheControl = cacheControlRawMessage()
		}
	}
	return blocks
}

func ApplyClaudeAutoCacheControl(request *dto.ClaudeRequest) {
	if request == nil || !common.ClaudeAutoCacheControlEnabled {
		return
	}

	if request.IsStringSystem() {
		systemText := request.GetStringSystem()
		if len(systemText) >= common.ClaudeAutoCacheMinChars {
			request.System = []dto.ClaudeMediaMessage{{
				Type:         "text",
				Text:         common.GetPointer(systemText),
				CacheControl: cacheControlRawMessage(),
			}}
		}
	} else if request.System != nil {
		systems := request.ParseSystem()
		if len(systems) > 0 {
			request.System = applyMediaCacheControl(systems)
		}
	}

	for i := range request.Messages {
		if request.Messages[i].IsStringContent() {
			content := request.Messages[i].GetStringContent()
			if len(content) >= common.ClaudeAutoCacheMinChars {
				request.Messages[i].Content = []dto.ClaudeMediaMessage{{
					Type:         "text",
					Text:         common.GetPointer(content),
					CacheControl: cacheControlRawMessage(),
				}}
			}
			continue
		}
		blocks, err := request.Messages[i].ParseContent()
		if err == nil && len(blocks) > 0 {
			request.Messages[i].Content = applyMediaCacheControl(blocks)
		}
	}
}
