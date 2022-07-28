import * as React from 'react'
import styled from 'styled-components'
import dynamic from 'next/dynamic'

// import { Editor } from '@example/atlassian'

import { Layout } from '../components/Layout'
import { PageHeader } from '../components/PageHeader'

interface IProps {}

const EditorWithNoSSR = dynamic(() => import('@example/atlassian'), { ssr: false })

export default function AtlassianPage(props: IProps) {
  return (
    <Layout>
      <PageHeader>
        <EditorWithNoSSR performanceTracking />
      </PageHeader>
    </Layout>
  )
}
