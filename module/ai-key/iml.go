package ai_key

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/APIParkLab/APIPark/service/cluster"
	"github.com/eolinker/eosc/log"

	"github.com/APIParkLab/APIPark/gateway"

	"github.com/eolinker/go-common/utils"

	"gorm.io/gorm"

	"github.com/eolinker/go-common/auto"

	model_runtime "github.com/APIParkLab/APIPark/ai-provider/model-runtime"

	"github.com/google/uuid"

	"github.com/eolinker/go-common/store"

	"github.com/APIParkLab/APIPark/service/ai"

	ai_key_dto "github.com/APIParkLab/APIPark/module/ai-key/dto"
	ai_key "github.com/APIParkLab/APIPark/service/ai-key"
)

var _ IKeyModule = &imlKeyModule{}

type imlKeyModule struct {
	providerService ai.IProviderService     `autowired:""`
	aiKeyService    ai_key.IKeyService      `autowired:""`
	clusterService  cluster.IClusterService `autowired:""`
	transaction     store.ITransaction      `autowired:""`
}

func newKey(key *ai_key.Key) *gateway.DynamicRelease {

	return &gateway.DynamicRelease{
		BasicItem: &gateway.BasicItem{
			ID:          fmt.Sprintf("%s-%s", key.Provider, key.ID),
			Description: key.Name,
			Resource:    "ai-key",
			Version:     time.Now().Format("20060102150405"),
			MatchLabels: map[string]string{
				"module": "ai-key",
			},
		},
		Attr: map[string]interface{}{
			"expired":  key.ExpireTime,
			"config":   key.Config,
			"provider": key.Provider,
			"priority": key.Priority,
			"disabled": key.Status == 0,
		},
	}
}

func (i *imlKeyModule) Create(ctx context.Context, providerId string, input *ai_key_dto.Create) error {
	_, err := i.providerService.Get(ctx, providerId)
	if err != nil {
		return fmt.Errorf("provider not found: %w", err)
	}
	p, has := model_runtime.GetProvider(providerId)
	if !has {
		return fmt.Errorf("provider not found: %w", err)
	}
	p.URI()
	err = p.Check(input.Config)
	if err != nil {
		return fmt.Errorf("config check failed: %w", err)
	}
	priority, err := i.aiKeyService.MaxPriority(ctx, providerId)
	if err != nil {
		return fmt.Errorf("get key error: %v", err)
	}
	return i.transaction.Transaction(ctx, func(ctx context.Context) error {
		if input.Id == "" {
			input.Id = uuid.NewString()
		}
		status := ai_key_dto.KeyNormal.Int()
		if input.ExpireTime > 0 && time.Unix(int64(input.ExpireTime), 0).Before(time.Now()) {
			status = ai_key_dto.KeyExpired.Int()
		}

		err = i.aiKeyService.Create(ctx, &ai_key.Create{
			ID:         input.Id,
			Name:       input.Name,
			Config:     input.Config,
			Provider:   providerId,
			Status:     status,
			ExpireTime: input.ExpireTime,
			Priority:   priority + 1,
		})

		info, _ := i.aiKeyService.Get(ctx, input.Id)
		releases := []*gateway.DynamicRelease{newKey(info)}
		return i.syncGateway(ctx, cluster.DefaultClusterID, releases, true)
	})
}

func (i *imlKeyModule) syncGateway(ctx context.Context, clusterId string, releases []*gateway.DynamicRelease, online bool) error {
	client, err := i.clusterService.GatewayClient(ctx, clusterId)
	if err != nil {
		log.Errorf("get apinto client error: %v", err)
		return nil
	}
	defer func() {
		err := client.Close(ctx)
		if err != nil {
			log.Warn("close apinto client:", err)
		}
	}()
	for _, releaseInfo := range releases {
		dynamicClient, err := client.Dynamic(releaseInfo.Resource)
		if err != nil {
			return err
		}
		if online {
			err = dynamicClient.Online(ctx, releaseInfo)
		} else {
			err = dynamicClient.Offline(ctx, releaseInfo)
		}
		if err != nil {
			return err
		}
	}

	return nil
}

func (i *imlKeyModule) Edit(ctx context.Context, providerId string, id string, input *ai_key_dto.Edit) error {
	p, has := model_runtime.GetProvider(providerId)
	if !has {
		return fmt.Errorf("provider not found: %s", providerId)
	}
	_, err := i.providerService.Get(ctx, providerId)
	if err != nil {
		return fmt.Errorf("provider not found: %w", err)
	}
	return i.transaction.Transaction(ctx, func(ctx context.Context) error {
		info, err := i.aiKeyService.Get(ctx, id)
		if err != nil {
			return fmt.Errorf("key not found: %w", err)
		}
		if input.Config != nil {
			err = p.Check(*input.Config)
			if err != nil {
				return fmt.Errorf("config check failed: %w", err)
			}
			cfg, err := p.GenConfig(*input.Config, info.Config)
			if err != nil {
				return fmt.Errorf("config gen failed: %w", err)
			}
			input.Config = &cfg
			if info.Default {
				err = i.providerService.Save(ctx, info.Provider, &ai.SetProvider{
					Config: input.Config,
				})
				if err != nil {
					return err
				}
			}
		}

		status := ai_key_dto.KeyNormal.Int()
		orgStatus := ai_key_dto.ToKeyStatus(info.Status)
		switch orgStatus {
		case ai_key_dto.KeyNormal, ai_key_dto.KeyError, ai_key_dto.KeyExpired:
			if input.ExpireTime != nil {
				expireTime := *input.ExpireTime
				if expireTime > 0 && time.Unix(int64(expireTime), 0).Before(time.Now()) {
					status = ai_key_dto.KeyExpired.Int()
				}
			} else if info.ExpireTime > 0 && time.Unix(int64(info.ExpireTime), 0).Before(time.Now()) {
				// 如果过期时间未更改，且已过期，则设置为过期状态
				status = ai_key_dto.KeyExpired.Int()
			}
		default:
			// 停用、超额需要启用，所以维持原状态
			status = orgStatus.Int()
		}

		err = i.aiKeyService.Save(ctx, id, &ai_key.Edit{
			Name:       input.Name,
			Config:     input.Config,
			ExpireTime: input.ExpireTime,
			Status:     &status,
		})
		if err != nil {
			return err
		}
		if status == ai_key_dto.KeyNormal.Int() {
			info, err = i.aiKeyService.Get(ctx, id)
			if err != nil {
				return err
			}
			releases := []*gateway.DynamicRelease{newKey(info)}
			return i.syncGateway(ctx, cluster.DefaultClusterID, releases, true)
		}
		return nil
	})

}

func (i *imlKeyModule) Delete(ctx context.Context, providerId string, id string) error {
	_, err := i.providerService.Get(ctx, providerId)
	if err != nil {
		return fmt.Errorf("provider not found: %w", err)
	}
	return i.transaction.Transaction(ctx, func(ctx context.Context) error {
		info, err := i.aiKeyService.Get(ctx, id)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if info.Default {
			return fmt.Errorf("default key can't be deleted: %s", id)
		}
		keys, err := i.aiKeyService.KeysAfterPriority(ctx, providerId, info.Priority)
		if err != nil {
			return err
		}
		for _, key := range keys {
			key.Priority--
			err = i.aiKeyService.Save(ctx, key.ID, &ai_key.Edit{
				Priority: &key.Priority,
			})
			if err != nil {
				return err
			}
		}

		err = i.aiKeyService.Delete(ctx, id)
		if err != nil {
			return err
		}
		return i.syncGateway(ctx, cluster.DefaultClusterID, []*gateway.DynamicRelease{{
			BasicItem: &gateway.BasicItem{
				ID:       fmt.Sprintf("%s-%s", providerId, id),
				Resource: "ai-key",
			},
			Attr: nil,
		},
		}, false)
	})
}

func (i *imlKeyModule) Get(ctx context.Context, providerId string, id string) (*ai_key_dto.Key, error) {
	p, has := model_runtime.GetProvider(providerId)
	if !has {
		return nil, fmt.Errorf("provider not found: %s", providerId)
	}
	_, err := i.providerService.Get(ctx, providerId)
	if err != nil {
		return nil, fmt.Errorf("provider not found: %w", err)
	}
	info, err := i.aiKeyService.Get(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("key not found: %w", err)
	}

	return &ai_key_dto.Key{
		Id:         info.ID,
		Name:       info.Name,
		Config:     p.MaskConfig(info.Config),
		ExpireTime: info.ExpireTime,
	}, nil
}

func (i *imlKeyModule) List(ctx context.Context, providerId string, keyword string, page, pageSize int, statuses []string) ([]*ai_key_dto.Item, int64, error) {
	_, err := i.aiKeyService.DefaultKey(ctx, providerId)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, 0, fmt.Errorf("get default key failed: %w", err)
		}
		info, err := i.providerService.Get(ctx, providerId)
		if err != nil {
			return nil, 0, fmt.Errorf("provider is unconfigued,id is %s", providerId)
		}
		err = i.aiKeyService.Create(ctx, &ai_key.Create{
			ID:         info.Id,
			Name:       info.Name,
			Config:     info.Config,
			Provider:   info.Id,
			Status:     ai_key_dto.KeyNormal.Int(),
			Priority:   1,
			ExpireTime: 0,
			UseToken:   0,
			Default:    true,
		})
		if err != nil {
			return nil, 0, fmt.Errorf("create default key failed: %w", err)
		}
	}
	w := map[string]interface{}{
		"provider": providerId,
	}
	hasExpired := true
	if len(statuses) > 0 {
		hasExpired = false
		statusConditions := make([]int, 0, len(statuses))
		for _, s := range statuses {
			status := ai_key_dto.KeyStatus(s)
			if status == ai_key_dto.KeyExpired {
				hasExpired = true
			}
			statusConditions = append(statusConditions, status.Int())
		}
		w["status"] = statusConditions
	}
	var list []*ai_key.Key
	var total int64
	if !hasExpired {
		if keyword != "" {
			list, err = i.aiKeyService.Search(ctx, keyword, w, "sort asc")
			if err != nil {
				return nil, 0, err
			}
			if len(list) == 0 {
				return nil, 0, nil
			}
			uuids := utils.SliceToSlice(list, func(key *ai_key.Key) string {
				return key.ID
			})
			w["uuid"] = uuids
		}
		list, total, err = i.aiKeyService.SearchUnExpiredByPage(ctx, w, page, pageSize, "sort asc")
		if err != nil {
			return nil, 0, err
		}
	} else {
		list, total, err = i.aiKeyService.SearchByPage(ctx, keyword, w, page, pageSize, "sort asc")
		if err != nil {
			return nil, 0, err
		}
	}

	var result []*ai_key_dto.Item
	for _, item := range list {
		status := ai_key_dto.ToKeyStatus(item.Status)
		if item.ExpireTime > 0 && time.Unix(int64(item.ExpireTime), 0).Before(time.Now()) {
			status = ai_key_dto.KeyExpired
		}
		result = append(result, &ai_key_dto.Item{
			Id:         item.ID,
			Name:       item.Name,
			Status:     status,
			UseToken:   item.UseToken,
			UpdateTime: auto.TimeLabel(item.UpdateAt),
			ExpireTime: item.ExpireTime,
			CanDelete:  !item.Default,
			Priority:   item.Priority,
		})
	}

	return result, total, nil
}

func (i *imlKeyModule) UpdateKeyStatus(ctx context.Context, providerId string, id string, enable bool) error {
	_, err := i.providerService.Get(ctx, providerId)
	if err != nil {
		return fmt.Errorf("provider not found: %w", err)
	}
	info, err := i.aiKeyService.Get(ctx, id)
	if err != nil {
		return fmt.Errorf("key not found: %w", err)
	}
	return i.transaction.Transaction(ctx, func(ctx context.Context) error {
		if !enable {
			status := ai_key_dto.KeyDisable.Int()
			err = i.aiKeyService.Save(ctx, id, &ai_key.Edit{
				Status: &status,
			})
			if err != nil {
				return err
			}
			releases := []*gateway.DynamicRelease{{
				BasicItem: &gateway.BasicItem{
					ID:       fmt.Sprintf("%s-%s", providerId, id),
					Resource: "ai-key",
				},
				Attr: nil,
			}}
			return i.syncGateway(ctx, cluster.DefaultClusterID, releases, false)
		}
		if info.Status == ai_key_dto.KeyDisable.Int() || info.Status == ai_key_dto.KeyExceed.Int() {
			// 超额 或 停用状态，可启用
			if info.ExpireTime > 0 && time.Unix(int64(info.ExpireTime), 0).Before(time.Now()) {
				// 如果过期时间未更改，且已过期，则设置为过期状态
				status := ai_key_dto.KeyExpired.Int()
				return i.aiKeyService.Save(ctx, id, &ai_key.Edit{
					Status: &status,
				})
			}
			status := ai_key_dto.KeyNormal.Int()
			err = i.aiKeyService.Save(ctx, id, &ai_key.Edit{
				Status: &status,
			})
			if err != nil {
				return err
			}
			info, err = i.aiKeyService.Get(ctx, id)
			if err != nil {
				return err
			}
			releases := []*gateway.DynamicRelease{newKey(info)}
			return i.syncGateway(ctx, cluster.DefaultClusterID, releases, true)
		}
		return nil
	})
}

func (i *imlKeyModule) Sort(ctx context.Context, providerId string, input *ai_key_dto.Sort) error {
	_, err := i.providerService.Get(ctx, providerId)
	if err != nil {
		return fmt.Errorf("provider not found: %w", err)
	}
	return i.transaction.Transaction(ctx, func(ctx context.Context) error {
		switch input.Sort {
		case "before":
			_, err = i.aiKeyService.SortBefore(ctx, providerId, input.Origin, input.Target)
		case "after":
			_, err = i.aiKeyService.SortAfter(ctx, providerId, input.Origin, input.Target)
		default:
			return fmt.Errorf("invalid sort type: %s", input.Sort)
		}
		if err != nil {
			return err
		}
		list, err := i.aiKeyService.KeysByProvider(ctx, providerId)
		if err != nil {
			return err
		}
		releases := make([]*gateway.DynamicRelease, 0, len(list))
		for _, info := range list {
			releases = append(releases, newKey(info))
		}
		return i.syncGateway(ctx, cluster.DefaultClusterID, releases, true)
	})
}
