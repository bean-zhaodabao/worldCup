<template>
  <div class="sms-page">
    <div class="page-header">
      <h2>短信通知</h2>
      <el-tag :type="form.enabled ? 'success' : 'info'">{{ form.enabled ? '已开启' : '已关闭' }}</el-tag>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="阿里云返回 OK 仅代表请求已受理；签名/模板报备中、可用-异常或未报备时，运营商会拦截，手机可能收不到。请等待报备通过后再测试。"
      style="margin-bottom:16px"
    />

    <el-card style="margin-bottom:16px">
      <template #header><b>阿里云短信配置</b></template>
      <el-form :model="form" label-width="150px" v-loading="loading">
        <el-form-item label="短信开关">
          <el-switch v-model="form.enabled" />
          <span class="tip">开启后，用户下注成功会发送短信</span>
        </el-form-item>
        <el-form-item label="接收手机号">
          <el-input v-model="phonesText" placeholder="多个手机号用逗号分隔，如 13800000000,13900000000" style="max-width:520px" />
        </el-form-item>
        <el-form-item label="短信签名">
          <el-input v-model="form.signName" style="max-width:360px" />
        </el-form-item>
        <el-form-item label="模板 CODE">
          <el-input v-model="form.templateCode" style="max-width:360px" />
        </el-form-item>
        <el-form-item label="模板变量名">
          <el-input v-model="form.templateParamName" style="max-width:240px" />
          <span class="tip">当前模板：用户${name}有新的订单！变量名为 name</span>
        </el-form-item>
        <el-form-item label="AccessKey ID">
          <el-input v-model="form.accessKeyId" style="max-width:420px" placeholder="RAM 子账号 AccessKey ID" />
        </el-form-item>
        <el-form-item label="AccessKey Secret">
          <el-input v-model="form.accessKeySecret" type="password" show-password style="max-width:420px"
            :placeholder="form.hasSecret ? '已配置，留空表示不修改' : '请输入 AccessKey Secret'" />
          <span class="tip">只存在服务端，不会返回给前端；留空表示保留原值</span>
        </el-form-item>
        <el-form-item label="最低通知金额">
          <el-input-number v-model="form.minAmount" :min="0" :precision="2" :step="10" style="width:180px" />
          <span class="tip">0 表示每笔都发</span>
        </el-form-item>
        <el-form-item label="每日发送上限">
          <el-input-number v-model="form.dailyLimit" :min="0" :step="100" style="width:180px" />
          <span class="tip">0 表示不限制</span>
        </el-form-item>
        <el-form-item label="最大重试次数">
          <el-input-number v-model="form.maxRetry" :min="1" :max="10" style="width:180px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="doSave">保存配置</el-button>
          <el-button :loading="saving" @click="doTest">发送测试短信</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <template #header>
        <div class="log-header">
          <b>发送日志</b>
          <div class="log-filter">
            <el-input v-model="logQuery.orderNo" placeholder="订单号" clearable style="width:180px" />
            <el-select v-model="logQuery.success" placeholder="全部状态" clearable style="width:120px">
              <el-option label="已受理" value="true" />
              <el-option label="失败" value="false" />
            </el-select>
            <el-button type="primary" icon="Search" @click="loadLogs">搜索</el-button>
          </div>
        </div>
      </template>
      <el-table :data="logs.list" border stripe v-loading="logs.loading">
        <el-table-column label="时间" width="170"><template #default="{row}">{{ fmt(row.createTime) }}</template></el-table-column>
        <el-table-column prop="orderNo" label="订单号" width="175" />
        <el-table-column prop="phoneMasked" label="手机号" width="130" />
        <el-table-column prop="signName" label="签名" width="150" />
        <el-table-column label="状态" width="90">
          <template #default="{row}"><el-tag :type="row.success ? 'success' : 'danger'">{{ row.success ? '已受理' : '失败' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="bizId" label="BizId" width="190" />
        <el-table-column prop="code" label="返回码" width="140" />
        <el-table-column prop="message" label="返回信息" min-width="180" />
        <el-table-column label="操作" width="100">
          <template #default="{row}">
            <el-button v-if="!row.success && row.taskId && row.taskId !== 'test'" size="small" @click="doRetry(row)">重发</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="logs.page" v-model:page-size="logs.ps" :total="logs.total"
        layout="total,prev,pager,next" style="margin-top:16px;justify-content:flex-end" @change="loadLogs" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSmsConfig, updateSmsConfig, testSms, getSmsLogs, retrySms } from '@/api'

const loading = ref(false), saving = ref(false)
const phonesText = ref('')
const form = reactive({
  enabled: false,
  phones: [],
  signName: '',
  templateCode: '',
  templateParamName: 'name',
  accessKeyId: '',
  accessKeySecret: '',
  hasSecret: false,
  minAmount: 0,
  dailyLimit: 1000,
  maxRetry: 3
})

const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : ''

const loadConfig = async () => {
  loading.value = true
  try {
    const res = await getSmsConfig()
    const d = res.data || {}
    Object.assign(form, {
      enabled: !!d.enabled,
      phones: d.phones || [],
      signName: d.signName || '',
      templateCode: d.templateCode || '',
      templateParamName: d.templateParamName || 'name',
      accessKeyId: d.accessKeyId || '',
      accessKeySecret: '',
      hasSecret: !!d.hasSecret,
      minAmount: Number(d.minAmount || 0),
      dailyLimit: Number(d.dailyLimit || 0),
      maxRetry: Number(d.maxRetry || 3)
    })
    phonesText.value = (d.phones || []).join(',')
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  loading.value = false
}

const doSave = async () => {
  if (!phonesText.value.trim()) return ElMessage.warning('请填写接收手机号')
  if (!form.signName) return ElMessage.warning('请填写短信签名')
  if (!form.templateCode) return ElMessage.warning('请填写模板 CODE')
  saving.value = true
  try {
    await updateSmsConfig({
      enabled: form.enabled,
      phones: phonesText.value,
      signName: form.signName,
      templateCode: form.templateCode,
      templateParamName: form.templateParamName,
      accessKeyId: form.accessKeyId,
      accessKeySecret: form.accessKeySecret,
      minAmount: form.minAmount,
      dailyLimit: form.dailyLimit,
      maxRetry: form.maxRetry
    })
    ElMessage.success('短信配置已保存')
    form.accessKeySecret = ''
    loadConfig()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  saving.value = false
}

const doTest = async () => {
  try {
    await ElMessageBox.confirm('将使用已保存的配置向接收手机号发送一条测试短信，确认？', '测试短信', { type: 'info' })
  } catch (e) { return }
  saving.value = true
  try {
    const res = await testSms('')
    ElMessage.success('短信请求已提交，请稍后查看手机（以实际到达为准）')
    loadLogs()
  } catch (e) { ElMessage.error(e.message || '发送失败') }
  saving.value = false
}

const logs = reactive({ list: [], total: 0, page: 1, ps: 20, loading: false })
const logQuery = reactive({ orderNo: '', success: '' })
const loadLogs = async () => {
  logs.loading = true
  try {
    const res = await getSmsLogs({ ...logQuery, page: logs.page, pageSize: logs.ps })
    logs.list = res.data.list || []
    logs.total = res.data.total || 0
  } catch (e) { ElMessage.error(e.message || '加载失败') }
  logs.loading = false
}

const doRetry = async (row) => {
  try {
    await retrySms(row.taskId)
    ElMessage.success('已加入重发队列')
  } catch (e) { ElMessage.error(e.message || '重发失败') }
}

onMounted(() => {
  loadConfig()
  loadLogs()
})
</script>

<style lang="scss" scoped>
.sms-page .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
.tip { margin-left: 12px; color: #909399; font-size: 12px; }
.log-header { display:flex; justify-content:space-between; align-items:center; }
.log-filter { display:flex; gap:10px; }
</style>
