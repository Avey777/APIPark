import { ArrowLeftOutlined, LoadingOutlined } from '@ant-design/icons'
import { App, Button, Menu, MenuProps, Spin } from 'antd'
import { useState, useEffect, useMemo } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BasicResponse, STATUS_CODE } from '@common/const/const'
import { useBreadcrumb } from '@common/contexts/BreadcrumbContext'
import { useFetch } from '@common/hooks/http'
import { ItemType } from 'antd/es/breadcrumb/Breadcrumb'
import { RouterParams } from '@core/components/aoplatform/RenderRoutes'
import { useTenantManagementContext } from '@market/contexts/TenantManagementContext'
import { ManagementConfigFieldType } from './ManagementConfig'
import { useGlobalContext } from '@common/contexts/GlobalStateContext'
import { $t } from '@common/locales'
import { getItem } from '@common/utils/navigation'
import { MenuItemType } from 'antd/es/menu/interface'
import { PERMISSION_DEFINITION } from '@common/const/permissions'
import { cloneDeep } from 'lodash-es'

export default function ManagementInsidePage() {
  const { message } = App.useApp()
  const { fetchData } = useFetch()
  const { setBreadcrumb } = useBreadcrumb()
  const [activeMenu, setActiveMenu] = useState<string>('service')
  const { appId, teamId } = useParams<RouterParams>()
  const navigateTo = useNavigate()
  const currentUrl = useLocation().pathname
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const { appName, setAppName } = useTenantManagementContext()
  const { getTeamAccessData, cleanTeamAccessData, state, accessData, checkPermission, accessInit } = useGlobalContext()

  const TENANT_MANAGEMENT_APP_MENU: MenuProps['items'] = useMemo(
    () => [
      getItem($t('访问授权'), 'authorization', undefined, undefined, undefined, 'team.consumer.authorization.view'),
      getItem($t('MCP 服务'), 'mcp', undefined, undefined, undefined, 'team.consumer.mcp.view'),
      getItem($t('订阅的服务'), 'service', undefined, undefined, undefined, 'team.application.subscription.view'),
      getItem($t('消费者管理'), 'setting', undefined, undefined, undefined, 'team.application.application.view')
    ],
    [state.language]
  )

  const menuData = useMemo(() => {
    const filterMenu = (menu: (MenuItemType & { access: string })[]) => {
      const newMenu = cloneDeep(menu)
      return newMenu!.filter((c: MenuItemType & { access: string }) => {
        if (!c) return false
        return (c as MenuItemType & { access: string }).access
          ? checkPermission((c as MenuItemType & { access: string }).access as keyof (typeof PERMISSION_DEFINITION)[0])
          : true
      })
    }
    const filteredMenu = filterMenu(TENANT_MANAGEMENT_APP_MENU as (MenuItemType & { access: string })[])
    const menu = (activeMenu ?? filteredMenu[0]?.children) ? filteredMenu[0]?.children?.[0]?.key : filteredMenu[0]?.key
    if (menu && currentUrl.split('/')[-1] !== menu) navigateTo(`/consumer/${teamId}/inside/${appId}/${menu}`)
    return filteredMenu || []
  }, [accessData, accessInit, TENANT_MANAGEMENT_APP_MENU])

  useEffect(() => {
    setActiveMenu(currentUrl.split('/').pop() || 'service')
  }, [currentUrl])

  const onMenuClick: MenuProps['onClick'] = (node) => {
    setActiveMenu(node.key)
    navigateTo(`/consumer/${teamId}/inside/${appId}/${node.key}`)
  }

  useEffect(() => {
    const fetchDataAsync = async () => {
      let _appName = appName
      if (appId && !appName && !currentUrl.includes('setting')) {
        const { code, data } = await fetchData<BasicResponse<{ app: ManagementConfigFieldType }>>('app/info', {
          method: 'GET',
          eoParams: { app: appId, team: teamId },
          eoTransformKeys: ['as_app']
        })
        if (code === STATUS_CODE.SUCCESS) {
          _appName = data.app.name
          setAppName(_appName)
        }
      }
      setBreadcrumb([
        { title: <Link to={`/consumer/list/${teamId}`}>{$t('消费者')}</Link> },
        ...(_appName ? [{ title: _appName }] : [])
      ])
    }
    fetchDataAsync()
  }, [appId, appName])

  useEffect(() => {
    if (teamId) {
      getTeamAccessData(teamId)
    }
    return () => {
      cleanTeamAccessData()
    }
  }, [teamId])

  return (
    <>
      <Spin
        className="h-full"
        wrapperClassName="h-full"
        indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
        spinning={loading}
      >
        <div className="flex flex-1 h-full">
          <div className="w-[220px] border-0 border-solid border-r-[1px] border-r-BORDER">
            <div className="text-[18px] leading-[25px] pl-[12px] py-[12px]">
              <Button type="text" onClick={() => navigateTo(`/consumer/list/${teamId}`)}>
                <ArrowLeftOutlined className="max-h-[14px]" />
                {$t('返回')}
              </Button>
            </div>
            <Menu
              onClick={onMenuClick}
              openKeys={openKeys}
              onOpenChange={(e) => {
                setOpenKeys(e)
              }}
              className="h-[calc(100%-59px)] overflow-auto"
              style={{ width: 220 }}
              selectedKeys={[activeMenu!]}
              mode="inline"
              items={menuData as unknown as ItemType<MenuItemType>[]}
            />
          </div>
          <div className="w-[calc(100%-220px)] p-[20px] overflow-auto">
            <Outlet context={{ refreshGroup: () => {} }}></Outlet>
          </div>
        </div>
      </Spin>
    </>
  )
}
