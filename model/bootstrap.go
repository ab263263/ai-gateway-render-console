package model

import (
	"encoding/json"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
)

type bootstrapChannel struct {
	Type         int    `json:"type"`
	Key          string `json:"key"`
	Status       int    `json:"status"`
	Name         string `json:"name"`
	BaseURL      string `json:"base_url"`
	Models       string `json:"models"`
	Group        string `json:"group"`
	ModelMapping string `json:"model_mapping"`
	AutoBan      int    `json:"auto_ban"`
	Priority     int64  `json:"priority"`
	Weight       uint   `json:"weight"`
	Remark       string `json:"remark"`
}

type bootstrapPayload struct {
	Channels []bootstrapChannel `json:"channels"`
}

func BootstrapFromEnvIfEnabled() error {
	if os.Getenv("NEW_API_BOOTSTRAP") != "1" && strings.ToLower(os.Getenv("NEW_API_BOOTSTRAP")) != "true" {
		return nil
	}

	username := common.GetEnvOrDefaultString("NEW_API_BOOTSTRAP_ADMIN_USERNAME", "root")
	password := os.Getenv("NEW_API_BOOTSTRAP_ADMIN_PASSWORD")
	if password == "" {
		password = "12345678"
	}
	accessToken := os.Getenv("NEW_API_BOOTSTRAP_ACCESS_TOKEN")
	if accessToken == "" {
		accessToken = "wb-new-api-admin-access-token"
	}

	var user User
	if err := DB.Where("username = ?", username).First(&user).Error; err != nil {
		hashedPassword, err := common.Password2Hash(password)
		if err != nil {
			return err
		}
		user = User{
			Username:    username,
			Password:    hashedPassword,
			Role:        common.RoleRootUser,
			Status:      common.UserStatusEnabled,
			DisplayName: "Root User",
			Quota:       1000000000,
			Group:       "default",
		}
		user.SetAccessToken(accessToken)
		if err := DB.Create(&user).Error; err != nil {
			return err
		}
	} else {
		updates := map[string]interface{}{
			"quota":  1000000000,
			"status": common.UserStatusEnabled,
			"role":   common.RoleRootUser,
			"group":  "default",
		}
		if user.GetAccessToken() == "" {
			updates["access_token"] = accessToken
		}
		if err := DB.Model(&User{}).Where("id = ?", user.Id).Updates(updates).Error; err != nil {
			return err
		}
	}

	setup := GetSetup()
	if setup == nil {
		if err := DB.Create(&Setup{Version: common.Version, InitializedAt: time.Now().Unix()}).Error; err != nil {
			return err
		}
		constant.Setup = true
	}

	channelsJSON := os.Getenv("NEW_API_BOOTSTRAP_CHANNELS_JSON")
	if channelsJSON != "" {
		payload := bootstrapPayload{}
		if err := json.Unmarshal([]byte(channelsJSON), &payload); err != nil {
			return err
		}
		for _, ch := range payload.Channels {
			if ch.Name == "" || ch.Key == "" || ch.Models == "" {
				continue
			}
			var count int64
			DB.Model(&Channel{}).Where("name = ?", ch.Name).Count(&count)
			if count > 0 {
				continue
			}
			baseURL := ch.BaseURL
			modelMapping := ch.ModelMapping
			priority := ch.Priority
			autoBan := ch.AutoBan
			weight := ch.Weight
			remark := ch.Remark
			channel := Channel{
				Type:         ch.Type,
				Key:          ch.Key,
				Status:       ch.Status,
				Name:         ch.Name,
				BaseURL:      &baseURL,
				Models:       ch.Models,
				Group:        common.GetEnvOrDefaultString("NEW_API_BOOTSTRAP_CHANNEL_GROUP", "default"),
				ModelMapping: &modelMapping,
				Priority:     &priority,
				AutoBan:      &autoBan,
				Weight:       &weight,
				Remark:       &remark,
			}
			if channel.Group == "" {
				channel.Group = "default"
			}
			if channel.Type == 0 {
				channel.Type = constant.ChannelTypeOpenAI
			}
			if channel.Status == 0 {
				channel.Status = common.ChannelStatusEnabled
			}
			if channel.Weight == nil || *channel.Weight == 0 {
				w := uint(100)
				channel.Weight = &w
			}
			if err := channel.Insert(); err != nil {
				return err
			}
		}
	}

	defaultToken := os.Getenv("NEW_API_BOOTSTRAP_DEFAULT_TOKEN")
	if defaultToken != "" {
		defaultToken = strings.TrimPrefix(defaultToken, "sk-")
		var count int64
		DB.Model(&Token{}).Where("`key` = ?", defaultToken).Count(&count)
		if count == 0 {
			token := Token{
				UserId:             user.Id,
				Name:               "default-workbuddy-token",
				Key:                defaultToken,
				Status:             common.TokenStatusEnabled,
				CreatedTime:        common.GetTimestamp(),
				AccessedTime:       common.GetTimestamp(),
				ExpiredTime:        -1,
				UnlimitedQuota:     true,
				ModelLimitsEnabled: false,
				Group:              "default",
				CrossGroupRetry:    true,
			}
			if err := token.Insert(); err != nil {
				return err
			}
		}
	}

	InitChannelCache()
	return nil
}
