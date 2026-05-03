//! KeySelector — selects API keys from `platform_keys` with weighted random + failover.
//!
//! Selection rules:
//!   - Only `status='Active'` and `fail_count < 3`
//!   - Weight-based random selection; ties broken by oldest `last_used` (fair round-robin)
//!   - 30-second cooldown after failure before the key can be re-selected
//!   - On failure: `fail_count++`, `last_fail=now()`; auto-disables at `fail_count >= 3`
//!   - On success: `last_used=now()`, `fail_count=0`, `status='Active'`

use crate::db::DbPool;
use crate::error::{AppError, AppResult};

/// The result of key selection: key id (for later failure/success reporting) and the api_key value.
#[derive(Debug, Clone)]
pub struct SelectedKey {
    pub id: String,
    pub api_key: String,
    pub platform_id: String,
}

pub struct KeySelector;

impl KeySelector {
    /// Select an active API key for `platform_id` using weighted random + oldest-used tiebreak.
    /// Returns `None` if no active keys exist (caller should fall back to `platforms.api_key`).
    pub fn select(pool: &DbPool, platform_id: &str) -> AppResult<Option<SelectedKey>> {
        let keys = crate::db::platform_key::list_active_keys(pool, platform_id)?;
        if keys.is_empty() {
            return Ok(None);
        }

        let total_weight: i32 = keys.iter().map(|k| k.weight).sum();
        if total_weight <= 0 {
            // All weights are 0 or negative — use oldest-used (first in ordered list)
            let selected = &keys[0];
            crate::db::platform_key::update_last_used(pool, &selected.id)?;
            return Ok(Some(SelectedKey {
                id: selected.id.clone(),
                api_key: selected.api_key.clone(),
                platform_id: selected.platform_id.clone(),
            }));
        }

        // Weighted random
        let mut rng_val = rand::random::<u32>() as i32 % total_weight;
        for key in &keys {
            if rng_val < key.weight {
                crate::db::platform_key::update_last_used(pool, &key.id)?;
                return Ok(Some(SelectedKey {
                    id: key.id.clone(),
                    api_key: key.api_key.clone(),
                    platform_id: key.platform_id.clone(),
                }));
            }
            rng_val -= key.weight;
        }

        // Fallback: last key
        let selected = keys.last().unwrap();
        crate::db::platform_key::update_last_used(pool, &selected.id)?;
        Ok(Some(SelectedKey {
            id: selected.id.clone(),
            api_key: selected.api_key.clone(),
            platform_id: selected.platform_id.clone(),
        }))
    }

    /// Mark a key as failed (called when the upstream returns 4xx/5xx or connection error).
    pub fn mark_failed(pool: &DbPool, platform_id: &str, key_id: &str) {
        if let Err(e) = crate::db::platform_key::record_key_failure(pool, key_id) {
            tracing::warn!(
                "Failed to record key failure for key_id={} platform_id={}: {}",
                key_id, platform_id, e
            );
        }
    }

    /// Mark a key as successful (called on a 2xx response).
    pub fn mark_success(pool: &DbPool, platform_id: &str, key_id: &str) {
        if let Err(e) = crate::db::platform_key::record_key_success(pool, key_id) {
            tracing::warn!(
                "Failed to record key success for key_id={} platform_id={}: {}",
                key_id, platform_id, e
            );
        }
    }
}
