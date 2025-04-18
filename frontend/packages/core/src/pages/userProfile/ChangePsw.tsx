import WithPermission from '@common/components/aoplatform/WithPermission.tsx'
import { BasicResponse, RESPONSE_TIPS, STATUS_CODE } from '@common/const/const'
import { useFetch } from '@common/hooks/http.ts'
import { $t } from '@common/locales'
import { App, Button, Form, Input } from 'antd'

const ChangePsw = () => {
  const { message } = App.useApp()
  const { fetchData } = useFetch()
  const [form] = Form.useForm()

  const savePsw = () => {
    form.validateFields().then(value => {
      return fetchData<BasicResponse<null>>('account/password/reset', {
        method: 'PUT',
        eoBody: { ...value }
      })
        .then(response => {
          const { code, msg } = response
          if (code === STATUS_CODE.SUCCESS) {
            message.success(msg || $t(RESPONSE_TIPS.success))
          } else {
            message.error(msg || $t(RESPONSE_TIPS.error))
          }
          form.resetFields()
        })
        .catch(errorInfo => {
          console.warn(errorInfo)
        })
    })
  }

  return (
    <div className={`overflow-auto flex-1 h-full pr-PAGE_INSIDE_X`}>
      <WithPermission access={''}>
        <Form
          layout="vertical"
          labelAlign="left"
          name="changePsw"
          scrollToFirstError
          className="mx-auto pl-[10px]  "
          autoComplete="off"
          form={form}
          onFinish={savePsw}
        >
          <Form.Item
            name="old_password"
            label={$t('旧密码')}
            rules={[
              {
                required: true
              }
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="new_password"
            label={$t('新密码')}
            rules={[
              {
                required: true
              }
            ]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item
            name="confirm"
            label={$t('确认密码')}
            dependencies={['new_password']}
            rules={[
              {
                required: true
              },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error($t('两次密码不一致')))
                }
              })
            ]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item className="pb-0 pl-0 mb-0 bg-transparent border-none pt-btnrbase">
            <WithPermission access="">
              <Button type="primary" htmlType="submit">
                {$t('修改密码')}
              </Button>
            </WithPermission>
          </Form.Item>
        </Form>
      </WithPermission>
    </div>
  )
}

export default ChangePsw
