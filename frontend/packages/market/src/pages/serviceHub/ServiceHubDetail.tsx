import { ApiFilled, ArrowLeftOutlined } from '@ant-design/icons'
import { BasicResponse, RESPONSE_TIPS, STATUS_CODE } from '@common/const/const.tsx'
import { EntityItem, RouterParams } from '@common/const/type.ts'
import { useBreadcrumb } from '@common/contexts/BreadcrumbContext.tsx'
import { useFetch } from '@common/hooks/http.ts'
import { $t } from '@common/locales/index.ts'
import { Icon } from '@iconify/react/dist/iconify.js'
import { approvalTypeTranslate } from '@market/const/serviceHub/const.tsx'
import { App, Avatar, Button, Descriptions, Divider, Tabs } from 'antd'
import { DefaultOptionType } from 'antd/es/cascader'
import DOMPurify from 'dompurify'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApplyServiceHandle, ServiceBasicInfoType, ServiceDetailType } from '../../const/serviceHub/type.ts'
import { ApplyServiceModal } from './ApplyServiceModal.tsx'
import ServiceHubApiDocument from './ServiceHubApiDocument.tsx'
import Integrate from './integrate.tsx'

const ServiceHubDetail = () => {
  const { serviceId } = useParams<RouterParams>()
  const { setBreadcrumb } = useBreadcrumb()
  const [serviceBasicInfo, setServiceBasicInfo] = useState<ServiceBasicInfoType>()
  const [serviceName, setServiceName] = useState<string>()
  const [serviceDesc, setServiceDesc] = useState<string>()
  const [serviceDoc, setServiceDoc] = useState<string>()
  const { fetchData } = useFetch()
  const applyRef = useRef<ApplyServiceHandle>(null)
  const { modal, message } = App.useApp()
  const [mySystemOptionList, setMySystemOptionList] = useState<DefaultOptionType[]>()
  const [service, setService] = useState<ServiceDetailType>()
  const navigate = useNavigate()

  const modifyApiDoc = (apiDoc: string, apiPrefix: string) => {
    if (!apiDoc) return ''
    if (!apiPrefix) return apiDoc
    try {
      const openApiSpec = JSON.parse(apiDoc)
      // 遍历并修改 paths，给每个路径添加前缀
      const modifiedPaths: Record<string, unknown> = {}
      for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
        modifiedPaths[apiPrefix + path] = pathItem
      }
      openApiSpec.paths = modifiedPaths
      return JSON.stringify(openApiSpec)
    } catch (err) {
      console.warn('拼接api前缀失败', err)
    }
    return apiDoc
  }

  const getServiceBasicInfo = () => {
    fetchData<BasicResponse<{ service: ServiceDetailType }>>('catalogue/service', {
      method: 'GET',
      eoParams: { service: serviceId },
      eoTransformKeys: [
        'app_num',
        'api_num',
        'update_time',
        'api_doc',
        'invoke_address',
        'approval_type',
        'service_kind',
        'site_prefix'
      ]
    }).then((response) => {
      const { code, data, msg } = response
      if (code === STATUS_CODE.SUCCESS) {
        setService({
          ...data.service,
          apiDoc: modifyApiDoc(data.service.apiDoc, data.service.basic?.invokeAddress)
        })
        setServiceBasicInfo(data.service.basic)
        setServiceName(data.service.name)
        setServiceDesc(data.service.description)
        setServiceDoc(DOMPurify.sanitize(data.service.document))
      } else {
        message.error(msg || $t(RESPONSE_TIPS.error))
      }
    })
  }

  useEffect(() => {
    if (!serviceId) {
      console.warn('缺少serviceId')
      return
    }
    serviceId && getServiceBasicInfo()
  }, [serviceId])

  useEffect(() => {
    getMySelectList()
    setBreadcrumb([{ title: <Link to={`/serviceHub/list`}>{$t('服务市场')}</Link> }, { title: $t('服务详情') }])
  }, [])

  const getMySelectList = () => {
    setMySystemOptionList([])
    fetchData<BasicResponse<{ app: EntityItem[] }>>('apps/can_subscribe', { method: 'GET' }).then((response) => {
      const { code, data, msg } = response
      if (code === STATUS_CODE.SUCCESS) {
        setMySystemOptionList(
          data.app?.map((x: EntityItem) => {
            return {
              label: x.name,
              value: x.id
            }
          })
        )
      } else {
        message.error(msg || $t(RESPONSE_TIPS.error))
      }
    })
  }

  const openModal = (type: 'apply') => {
    modal.confirm({
      title: $t('申请服务'),
      content: (
        <ApplyServiceModal
          ref={applyRef}
          entity={{ ...serviceBasicInfo!, name: serviceName!, id: serviceId! }}
          mySystemOptionList={mySystemOptionList!}
        />
      ),
      onOk: () => {
        return applyRef.current?.apply().then((res) => {
          // if(res === true) setApplied(true)
        })
      },
      okText: $t('确认'),
      cancelText: $t('取消'),
      closable: true,
      icon: <></>,
      width: 600
    })
  }

  const items = [
    {
      key: 'introduction',
      label: $t('介绍'),
      children: (
        <>
          <div
            className="p-btnbase preview-document mb-PAGE_INSIDE_B"
            dangerouslySetInnerHTML={{ __html: serviceDoc || '' }}
          ></div>
        </>
      ),
      icon: <Icon icon="ic:baseline-space-dashboard" width="14" height="14" />
    },
    {
      key: 'api-document',
      label: $t('API 文档'),
      children: (
        <div
          className={`p-btnbase  ${serviceBasicInfo?.serviceKind?.toLocaleLowerCase() === 'ai' ? 'ai-service-api-preview' : ''}`}
        >
          <ServiceHubApiDocument service={service!} />
        </div>
      ),
      icon: <ApiFilled />
    },
    {
      key: 'api-integrate',
      label: $t('集成'),
      children: (
        <div
          className={`p-btnbase  ${serviceBasicInfo?.serviceKind?.toLocaleLowerCase() === 'ai' ? 'ai-service-api-preview' : ''}`}
        >
          <Integrate service={service!} />
        </div>
      ),
      icon: <Icon icon="icon-park-solid:whole-site-accelerator" width="15" height="15" />
    }
  ]

  return (
    <section className="grid grid-cols-5 h-full mr-PAGE_INSIDE_X">
      <section className="col-span-4 border-0 border-r-[1px] border-solid border-BORDER flex flex-col overflow-hidden">
        <section className="flex flex-col gap-btnbase p-btnbase">
          <div className="text-[18px] leading-[25px] pb-[12px]">
            <Button type="text" onClick={() => navigate(`/serviceHub/list`)}>
              <ArrowLeftOutlined className="max-h-[14px]" />
              {$t('返回')}
            </Button>
          </div>
          <div className="flex">
            {/* <Avatar shape="square" size={50} className=" bg-[linear-gradient(135deg,white,#f0f0f0)] text-[#333] rounded-[12px]" > {service?.name?.substring(0,1)}</Avatar> */}
            <Avatar
              shape="square"
              size={50}
              className={`rounded-[12px] border-none rounded-[12px] ${serviceBasicInfo?.logo ? 'bg-[linear-gradient(135deg,white,#f0f0f0)]' : 'bg-theme'}`}
              src={
                serviceBasicInfo?.logo ? (
                  <img
                    src={serviceBasicInfo?.logo}
                    alt="Logo"
                    style={{ maxWidth: '200px', width: '45px', height: '45px', objectFit: 'unset' }}
                  />
                ) : undefined
              }
              icon={serviceBasicInfo?.logo ? '' : <iconpark-icon name="auto-generate-api"></iconpark-icon>}
            >
              {' '}
            </Avatar>

            <div className="pl-[20px] w-[calc(100%-50px)]">
              <p className="text-[14px] h-[20px] leading-[20px] truncate font-bold flex items-center gap-[4px]">
                {serviceName}
              </p>
              <div className="mt-[10px] flex flex-col gap-btnrbase font-normal">
                <p>{serviceDesc || '-'}</p>
                <p className="flex items-center gap-[4px]">
                  <Icon icon="ic:baseline-link" width="18" height="18" />
                  <span className="font-bold">{$t('Base URL')}</span>: {serviceBasicInfo?.invokeAddress || '-'}
                </p>
                <div>
                  <Button type="primary" onClick={() => openModal('apply')}>
                    {$t('申请')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
        <Tabs className="p-btnbase pr-0 overflow-hidden [&>.ant-tabs-content-holder]:overflow-auto" items={items} />
      </section>
      <section className="col-span-1 p-btnbase px-btnrbase">
        <Descriptions title={$t('服务信息')} column={1} size={'small'}>
          <Descriptions.Item label={$t('接入消费者')}>{serviceBasicInfo?.appNum ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={$t('供应方')}>{serviceBasicInfo?.team?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label={$t('审核')}>
            {serviceBasicInfo?.approvalType ? $t(approvalTypeTranslate[serviceBasicInfo?.approvalType] || '-') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={$t('分类')}>{serviceBasicInfo?.catalogue?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label={$t('标签')}>
            {serviceBasicInfo?.tags?.map((x) => x.name)?.join(',') || '-'}
          </Descriptions.Item>
        </Descriptions>
        <Divider />
        <Descriptions column={1}>
          <Descriptions.Item label={$t('版本')}>{serviceBasicInfo?.version || '-'}</Descriptions.Item>
          <Descriptions.Item label={$t('更新时间')}>
            <span className="truncate" title={serviceBasicInfo?.updateTime}>
              {serviceBasicInfo?.updateTime || '-'}
            </span>
          </Descriptions.Item>
        </Descriptions>
      </section>
    </section>
  )
}

export default ServiceHubDetail
